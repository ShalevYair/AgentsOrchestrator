import {
  ProviderError,
  ProviderRateLimitError,
  type CacheableContent,
  type CacheRef,
  type CountRequest,
  type Delta,
  type FinishReason,
  type GenerateRequest,
  type LLMProvider,
  type Message,
  type ModelInfo,
} from "@ao/shared";
import { createSecretRegistry, type Logger, type SecretRegistry } from "@ao/platform";
import { ResponseCache } from "../cache/response-cache.js";
import type { RedactionEvent } from "../egress/redact-payload.js";
import { redactPayload } from "../egress/redact-payload.js";
import { ConcurrencyLimiter } from "../resilience/concurrency-limiter.js";
import { extractRetryDelayMs, withRetry, type RetryOptions } from "../resilience/retry.js";
import {
  createGeminiSdkClient,
  type GeminiCachedContent,
  type GeminiContent,
  type GeminiCreateCachedContentParams,
  type GeminiGenerateContentConfig,
  type GeminiGenerateContentParams,
  type GeminiGenerateContentResponse,
  type GeminiModel,
  type GeminiSdkClient,
} from "./client.js";
import { toGeminiSchema } from "./schema-dialect.js";
import { normalizeUsage } from "./usage.js";

const DEFAULT_MAX_CONCURRENCY = 5;

export interface GeminiProviderOptions {
  apiKey: string;
  /** Test seam: inject a fake `GeminiSdkClient` instead of a real `@google/genai` client. */
  client?: GeminiSdkClient;
  concurrencyLimiter?: ConcurrencyLimiter;
  responseCache?: ResponseCache<Delta[]>;
  /**
   * Shared with whatever creates the app's logger (`@ao/platform`'s
   * `createSecretRegistry`) so the loaded key is caught both in logs
   * (P0-T7) and on egress (P1-T9) from a single registration — pass the
   * SAME instance to both, or accept that this provider registers its own.
   */
  secretRegistry?: SecretRegistry;
  logger?: Logger;
  retry?: Partial<Omit<RetryOptions, "classify">>;
}

function toGeminiContents(contents: Message[]): GeminiContent[] {
  return contents.map((m) => ({ role: m.role, parts: m.parts.map((p) => ({ text: p.text })) }));
}

function extractStatus(error: unknown): number | undefined {
  if (error !== null && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return undefined;
}

/** P1-T5: 429/5xx are retryable; honors a server-stated retry delay when the error message carries one. */
function classifyGeminiError(error: unknown): { retryable: boolean; retryAfterMs?: number } {
  const status = extractStatus(error);
  if (status === undefined) return { retryable: false };
  const retryable = status === 429 || (status >= 500 && status < 600);
  if (!retryable) return { retryable: false };
  const message = error instanceof Error ? error.message : String(error);
  const retryAfterMs = extractRetryDelayMs(message);
  return retryAfterMs === undefined ? { retryable } : { retryable, retryAfterMs };
}

function toProviderError(error: unknown): Error {
  const status = extractStatus(error);
  const message = error instanceof Error ? error.message : String(error);
  if (status === 429) {
    return new ProviderRateLimitError(`Gemini rate limit exceeded (status 429): ${message}`, {
      cause: error,
    });
  }
  return new ProviderError(
    `Gemini request failed${status !== undefined ? ` (status ${String(status)})` : ""}: ${message}`,
    {
      cause: error,
    },
  );
}

function normalizeFinishReason(reason: string | undefined): FinishReason | undefined {
  switch (reason) {
    case undefined:
      return undefined;
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "max_tokens";
    case "SAFETY":
    case "PROHIBITED_CONTENT":
    case "SPII":
    case "BLOCKLIST":
    case "IMAGE_SAFETY":
      return "safety";
    default:
      return "other";
  }
}

/**
 * A streamed chunk's parts are, in practice, either all "thinking" text or
 * all answer text — Gemini doesn't interleave the two within one chunk in
 * normal operation. `isThought` is computed as "every part in this chunk
 * is a thought part", which is exact for that common case and a
 * documented simplification (favoring answer classification) for the
 * theoretical mixed case, which P1's scope doesn't need to handle exactly.
 */
function chunkToDelta(chunk: GeminiGenerateContentResponse): Delta {
  const candidate = chunk.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const isThought = parts.length > 0 && parts.every((p) => p.thought === true);
  const text = parts.map((p) => p.text ?? "").join("");
  const delta: Delta = { text, isThought };
  const finishReason = normalizeFinishReason(candidate?.finishReason);
  if (finishReason) delta.finishReason = finishReason;
  if (chunk.usageMetadata) delta.usage = normalizeUsage(chunk.usageMetadata);
  return delta;
}

/** Gemini model resource names come back as "models/gemini-3.7-flash"; every other call site (generate/countTokens) expects the bare id, so this is the one place the prefix is stripped. */
function toModelInfo(model: GeminiModel): ModelInfo {
  const id = (model.name ?? "").replace(/^models\//, "");
  const supportedActions = model.supportedActions ?? [];
  return {
    id,
    displayName: model.displayName ?? id,
    contextWindowTokens: Math.max(1, model.inputTokenLimit ?? 1),
    maxOutputTokens: Math.max(1, model.outputTokenLimit ?? 1),
    supportsGenerate: supportedActions.includes("generateContent"),
    supportsCountTokens: supportedActions.includes("countTokens"),
    supportsCaching: supportedActions.includes("createCachedContent"),
    supportsThinking: model.thinking === true,
  };
}

/** P1-T2 — the real Gemini implementation of the shared `LLMProvider` contract. */
export class GeminiProvider implements LLMProvider {
  private readonly client: GeminiSdkClient;
  private readonly concurrency: ConcurrencyLimiter;
  private readonly cache: ResponseCache<Delta[]>;
  private readonly secretRegistry: SecretRegistry;
  private readonly logger: Logger | undefined;
  private readonly retryOverrides: Partial<Omit<RetryOptions, "classify">>;
  private readonly egressRedactionLog: RedactionEvent[] = [];

  constructor(options: GeminiProviderOptions) {
    this.client = options.client ?? createGeminiSdkClient(options.apiKey);
    this.concurrency = options.concurrencyLimiter ?? new ConcurrencyLimiter(DEFAULT_MAX_CONCURRENCY);
    this.cache = options.responseCache ?? new ResponseCache<Delta[]>();
    this.secretRegistry = options.secretRegistry ?? createSecretRegistry();
    this.secretRegistry.register(options.apiKey);
    this.logger = options.logger;
    this.retryOverrides = options.retry ?? {};
  }

  /** Every redaction this provider has made on outbound payloads so far (P1-T9: "every redaction is logged/recorded"). */
  getEgressRedactions(): readonly RedactionEvent[] {
    return this.egressRedactionLog;
  }

  async countTokens(req: CountRequest): Promise<number> {
    const response = await this.withResilience(() =>
      this.client.models.countTokens({ model: req.model, contents: toGeminiContents(req.contents) }),
    );
    return response.totalTokens ?? 0;
  }

  async *generate(req: GenerateRequest): AsyncIterable<Delta> {
    const cacheKeyInput = {
      model: req.model,
      prompt: JSON.stringify(toGeminiContents(req.contents)),
      params: {
        systemInstruction: req.systemInstruction ?? null,
        thinkingLevel: req.thinkingLevel ?? null,
        maxOutputTokens: req.maxOutputTokens ?? null,
        temperature: req.temperature ?? null,
        cachedContentRef: req.cachedContentRef ?? null,
        responseSchema: req.responseSchema ? toGeminiSchema(req.responseSchema) : null,
      },
    };
    const cached = this.cache.get(cacheKeyInput);
    if (cached) {
      for (const delta of cached) yield delta;
      return;
    }

    const params = this.applyEgressRedaction(this.toGeminiGenerateParams(req));
    const stream = await this.withResilience(() => this.client.models.generateContentStream(params));

    const collected: Delta[] = [];
    for await (const chunk of stream) {
      const delta = chunkToDelta(chunk);
      collected.push(delta);
      yield delta;
    }
    this.cache.set(cacheKeyInput, collected);
  }

  async cacheCreate(content: CacheableContent): Promise<CacheRef> {
    const params = this.applyEgressRedaction(this.toGeminiCacheParams(content));
    const created = await this.withResilience(() => this.client.caches.create(params));
    return this.toCacheRef(created, content.model);
  }

  async models(): Promise<ModelInfo[]> {
    const page = await this.withResilience(() => this.client.models.list());
    const out: ModelInfo[] = [];
    for await (const model of page) {
      out.push(toModelInfo(model));
    }
    return out;
  }

  private toGeminiGenerateParams(req: GenerateRequest): GeminiGenerateContentParams {
    const config: GeminiGenerateContentConfig = {};
    if (req.systemInstruction !== undefined) config.systemInstruction = req.systemInstruction;
    if (req.maxOutputTokens !== undefined) config.maxOutputTokens = req.maxOutputTokens;
    if (req.temperature !== undefined) config.temperature = req.temperature;
    if (req.thinkingLevel !== undefined) {
      config.thinkingConfig = { thinkingLevel: req.thinkingLevel.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" };
    }
    if (req.responseSchema !== undefined) {
      config.responseMimeType = "application/json";
      config.responseSchema = toGeminiSchema(req.responseSchema);
    }
    if (req.cachedContentRef !== undefined) config.cachedContent = req.cachedContentRef;

    const params: GeminiGenerateContentParams = {
      model: req.model,
      contents: toGeminiContents(req.contents),
    };
    if (Object.keys(config).length > 0) params.config = config;
    return params;
  }

  private toGeminiCacheParams(content: CacheableContent): GeminiCreateCachedContentParams {
    const config: GeminiCreateCachedContentParams["config"] = {
      contents: toGeminiContents(content.contents),
      ttl: `${String(content.ttlSeconds)}s`,
    };
    if (content.systemInstruction !== undefined) config.systemInstruction = content.systemInstruction;
    if (content.displayName !== undefined) config.displayName = content.displayName;
    return { model: content.model, config };
  }

  private toCacheRef(created: GeminiCachedContent, fallbackModel: string): CacheRef {
    if (!created.name) {
      throw new ProviderError("Gemini caches.create returned no cache resource name");
    }
    const ref: CacheRef = {
      name: created.name,
      model: created.model ?? fallbackModel,
      expiresAt: created.expireTime ?? new Date().toISOString(),
    };
    if (created.usageMetadata?.totalTokenCount !== undefined) {
      ref.cachedTokenCount = created.usageMetadata.totalTokenCount;
    }
    return ref;
  }

  private applyEgressRedaction<T>(payload: T): T {
    const { payload: redacted, redactions } = redactPayload(payload, this.secretRegistry);
    if (redactions.length > 0) {
      this.egressRedactionLog.push(...redactions);
      this.logger?.warn({ redactions }, "redacted secret(s) from an outbound Gemini payload");
    }
    return redacted;
  }

  private async withResilience<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await withRetry(() => this.concurrency.run(fn), {
        classify: classifyGeminiError,
        ...this.retryOverrides,
      });
    } catch (error) {
      throw toProviderError(error);
    }
  }
}
