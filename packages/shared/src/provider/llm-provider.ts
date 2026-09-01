import type { z } from "zod";
import type { ThinkingLevel } from "../schemas/common.js";
import type { Usage } from "../schemas/common.js";
import type { ModelInfo } from "../schemas/model-info.js";

/**
 * `LLMProvider` — ARCHITECTURE.md §7. This is the ONE contract `core`
 * (built in P4/P5) is allowed to depend on. It lives in `@ao/shared`
 * rather than `@ao/providers` deliberately: `@ao/shared` is already the
 * base leaf every package depends on, so `core` gets the interface without
 * ever importing `@ao/providers` (and therefore never the concrete Gemini
 * SDK types `GeminiProvider` wraps) into its own type signatures. A
 * concrete provider instance reaches `core` only via dependency injection
 * at the composition root (`apps/runtime`, later). `@ao/providers` stays a
 * leaf package itself — it implements this contract but never imports it
 * back from anywhere that would create a cycle.
 */

export type MessageRole = "user" | "model";

export interface MessagePart {
  text: string;
}

export interface Message {
  role: MessageRole;
  parts: MessagePart[];
}

export interface CountRequest {
  model: string;
  contents: Message[];
}

/**
 * `responseSchema` takes a raw Zod schema, not a pre-narrowed provider
 * dialect — callers (recon/planner/checkpoint call sites in P5/P6) send
 * the same Zod schema PROTOCOLS.md defines the contract with, and never
 * need to know that Gemini's `responseSchema` field expects its own
 * OpenAPI-subset dialect rather than standard JSON Schema. That narrowing
 * is the Gemini adapter's job (packages/providers/src/gemini/schema-dialect.ts).
 */
export interface GenerateRequest {
  model: string;
  contents: Message[];
  systemInstruction?: string;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  temperature?: number;
  responseSchema?: z.ZodType;
  /** `CacheRef.name` of a previously created context cache to reuse (ARCHITECTURE.md §7). */
  cachedContentRef?: string;
}

export type FinishReason = "stop" | "max_tokens" | "safety" | "other";

export interface Delta {
  /** Incremental text for this chunk. Empty string for a chunk that carries only final metadata. */
  text: string;
  /** True when `text` is model "thinking" output rather than the final answer (ARCHITECTURE.md §7, thinking levels). */
  isThought: boolean;
  /** Present only on the terminal delta of the stream. */
  finishReason?: FinishReason;
  /** Present only on the terminal delta — full `usageMetadata` for the whole call, normalized. */
  usage?: Usage;
}

export interface CacheableContent {
  model: string;
  contents: Message[];
  systemInstruction?: string;
  ttlSeconds: number;
  displayName?: string;
}

export interface CacheRef {
  /** Provider-assigned resource name (e.g. Gemini's `cachedContents/xxxx`) — pass back as `cachedContentRef`. */
  name: string;
  model: string;
  /** ISO 8601. */
  expiresAt: string;
  cachedTokenCount?: number;
}

export interface LLMProvider {
  /** Exact input token count before sending — the basis for admission control (BUDGET.md §4.1), not an estimate. */
  countTokens(req: CountRequest): Promise<number>;
  /** Streaming generation. */
  generate(req: GenerateRequest): AsyncIterable<Delta>;
  /** Creates a context cache for a shared prompt prefix (the "Contract Block"). */
  cacheCreate(content: CacheableContent): Promise<CacheRef>;
  /** Live model catalog — the basis for model registry validation (P1-T7) and key validation (P1-T4). */
  models(): Promise<ModelInfo[]>;
}
