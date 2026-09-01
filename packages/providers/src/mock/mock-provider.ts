import type {
  CacheableContent,
  CacheRef,
  CountRequest,
  Delta,
  FinishReason,
  GenerateRequest,
  LLMProvider,
  Message,
  ModelInfo,
  Usage,
} from "@ao/shared";

/**
 * P1-T1's "full mock implementation of LLMProvider for tests" — the shape
 * `core` (P4/P5) and every other package's unit tests will construct
 * against instead of a real `GeminiProvider`, since TASKS.md's top rule is
 * zero LLM/network calls in unit tests.
 */
export interface MockGenerateResponse {
  text: string;
  isThought?: boolean;
  finishReason?: FinishReason;
  usage?: Usage;
  /** Number of deltas to split `text` into when streamed — default 1 (a single delta). */
  chunkCount?: number;
}

export interface MockLLMProviderOptions {
  /**
   * An array is consumed in call order across successive `generate()`
   * calls (the last entry repeats once exhausted, so a single-entry array
   * behaves like a constant response); a function computes a response
   * per-request for scenarios that need to react to what was asked.
   */
  responses?: MockGenerateResponse[] | ((req: GenerateRequest) => MockGenerateResponse);
  models?: ModelInfo[];
  /** Tokens-per-character used by the default `countTokens`/usage estimate — deliberately crude, this is a mock. */
  tokensPerChar?: number;
}

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "gemini-3.7-flash",
    displayName: "Gemini 3.7 Flash (mock)",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 64_000,
    supportsGenerate: true,
    supportsCountTokens: true,
    supportsCaching: true,
    supportsThinking: true,
  },
  {
    id: "gemini-flash-lite-latest",
    displayName: "Gemini Flash-Lite (mock)",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 8_000,
    supportsGenerate: true,
    supportsCountTokens: true,
    supportsCaching: false,
    supportsThinking: true,
  },
];

function serializeContents(contents: Message[]): string {
  return contents.map((m) => m.parts.map((p) => p.text).join("")).join("\n");
}

function estimateTokens(text: string, tokensPerChar: number): number {
  return Math.max(1, Math.ceil(text.length * tokensPerChar));
}

function splitIntoChunks(text: string, count: number): string[] {
  if (count <= 1 || text.length === 0) return [text];
  const size = Math.ceil(text.length / count);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export interface MockLLMProviderCalls {
  generate: GenerateRequest[];
  countTokens: CountRequest[];
  cacheCreate: CacheableContent[];
  modelsCallCount: number;
}

export class MockLLMProvider implements LLMProvider {
  readonly calls: MockLLMProviderCalls = {
    generate: [],
    countTokens: [],
    cacheCreate: [],
    modelsCallCount: 0,
  };

  private readonly modelList: ModelInfo[];
  private readonly tokensPerChar: number;
  private readonly responses?: MockGenerateResponse[] | ((req: GenerateRequest) => MockGenerateResponse);
  private responseIndex = 0;
  private cacheCounter = 0;

  constructor(options: MockLLMProviderOptions = {}) {
    this.modelList = options.models ?? DEFAULT_MODELS;
    this.tokensPerChar = options.tokensPerChar ?? 0.3;
    if (options.responses !== undefined) {
      this.responses = options.responses;
    }
  }

  countTokens(req: CountRequest): Promise<number> {
    this.calls.countTokens.push(req);
    return Promise.resolve(estimateTokens(serializeContents(req.contents), this.tokensPerChar));
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- must be async to satisfy LLMProvider.generate's AsyncIterable<Delta> return shape; this mock never needs to await anything itself.
  async *generate(req: GenerateRequest): AsyncIterable<Delta> {
    this.calls.generate.push(req);
    const response = this.resolveResponse(req);
    const chunkCount = Math.max(1, response.chunkCount ?? 1);
    const chunks = splitIntoChunks(response.text, chunkCount);

    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      const delta: Delta = { text: chunks[i] ?? "", isThought: response.isThought ?? false };
      if (isLast) {
        delta.finishReason = response.finishReason ?? "stop";
        delta.usage = response.usage ?? {
          promptTokens: estimateTokens(serializeContents(req.contents), this.tokensPerChar),
          candidatesTokens: estimateTokens(response.text, this.tokensPerChar),
          thoughtsTokens: 0,
          cachedTokens: 0,
        };
      }
      yield delta;
    }
  }

  cacheCreate(content: CacheableContent): Promise<CacheRef> {
    this.calls.cacheCreate.push(content);
    this.cacheCounter += 1;
    return Promise.resolve({
      name: `mock-cache-${String(this.cacheCounter)}`,
      model: content.model,
      expiresAt: new Date(Date.now() + content.ttlSeconds * 1000).toISOString(),
      cachedTokenCount: estimateTokens(serializeContents(content.contents), this.tokensPerChar),
    });
  }

  models(): Promise<ModelInfo[]> {
    this.calls.modelsCallCount += 1;
    return Promise.resolve(this.modelList);
  }

  private resolveResponse(req: GenerateRequest): MockGenerateResponse {
    if (typeof this.responses === "function") {
      return this.responses(req);
    }
    if (Array.isArray(this.responses) && this.responses.length > 0) {
      const index = Math.min(this.responseIndex, this.responses.length - 1);
      this.responseIndex += 1;
      const response = this.responses[index];
      if (response) return response;
    }
    return { text: "mock response" };
  }
}
