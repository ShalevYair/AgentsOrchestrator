import { GoogleGenAI } from "@google/genai";

/**
 * The thin structural slice of `@google/genai`'s `GoogleGenAI` client that
 * `GeminiProvider` actually calls, verified field-by-field against the
 * installed SDK's `.d.ts` (package version 2.20.0, resolved live from the
 * npm registry while building this — see `schema-dialect.ts`'s header for
 * what could and couldn't be independently verified over the network in
 * this environment).
 *
 * Kept as a narrow structural interface — rather than importing the SDK's
 * own types directly into every call site — so unit tests can hand
 * `GeminiProvider` a plain object satisfying this shape instead of the real
 * `GoogleGenAI` (which would make a network call). The real client
 * satisfies this interface structurally with no adapter needed.
 */
export interface GeminiContentPart {
  text?: string;
  thought?: boolean;
}

export interface GeminiContent {
  role?: string;
  parts?: GeminiContentPart[];
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
}

export interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
}

export interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

export interface GeminiThinkingConfig {
  thinkingLevel?: "LOW" | "MEDIUM" | "HIGH";
}

export interface GeminiGenerateContentConfig {
  systemInstruction?: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  thinkingConfig?: GeminiThinkingConfig;
  cachedContent?: string;
}

export interface GeminiGenerateContentParams {
  model: string;
  contents: GeminiContent[];
  config?: GeminiGenerateContentConfig;
}

export interface GeminiCountTokensParams {
  model: string;
  contents: GeminiContent[];
}

export interface GeminiCountTokensResponse {
  totalTokens?: number;
}

export interface GeminiModel {
  name?: string;
  displayName?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedActions?: string[];
  thinking?: boolean;
}

export interface GeminiListModelsParams {
  config?: { pageSize?: number };
}

export interface GeminiCreateCachedContentConfig {
  contents?: GeminiContent[];
  systemInstruction?: string;
  ttl?: string;
  displayName?: string;
}

export interface GeminiCreateCachedContentParams {
  model: string;
  config?: GeminiCreateCachedContentConfig;
}

export interface GeminiCachedContentUsageMetadata {
  totalTokenCount?: number;
}

export interface GeminiCachedContent {
  name?: string;
  model?: string;
  expireTime?: string;
  usageMetadata?: GeminiCachedContentUsageMetadata;
}

export interface GeminiSdkClient {
  models: {
    // Property (arrow-function) syntax deliberately, not method shorthand:
    // method shorthand carries an implicit `this`, which both trips
    // @typescript-eslint/unbound-method at every bare `expect(client.models.x)`
    // call site in tests and is meaningless here anyway, since these are
    // plain function values, not real class methods.
    generateContent: (params: GeminiGenerateContentParams) => Promise<GeminiGenerateContentResponse>;
    generateContentStream: (
      params: GeminiGenerateContentParams,
    ) => Promise<AsyncIterable<GeminiGenerateContentResponse>>;
    countTokens: (params: GeminiCountTokensParams) => Promise<GeminiCountTokensResponse>;
    list: (params?: GeminiListModelsParams) => Promise<AsyncIterable<GeminiModel>>;
  };
  caches: {
    create: (params: GeminiCreateCachedContentParams) => Promise<GeminiCachedContent>;
  };
}

/**
 * Builds the real client. Never called from unit tests — see
 * GeminiSdkClient's doc comment.
 *
 * The casts below are the one deliberate seam where our narrow structural
 * types meet the real SDK's nominal types: `thinkingLevel` is typed here
 * as the plain string union `"LOW" | "MEDIUM" | "HIGH"`, while the SDK's
 * own `ThinkingConfig.thinkingLevel` is a TS string *enum* — and a string
 * enum, unlike a numeric one, is not structurally assignable from an
 * equivalent string literal type in TypeScript, even though the runtime
 * values are identical. The cast is narrow (targets exactly the SDK's own
 * parameter type via `Parameters<...>[0]`), not a blanket `any`.
 */
export function createGeminiSdkClient(apiKey: string): GeminiSdkClient {
  const ai = new GoogleGenAI({ apiKey });
  return {
    models: {
      generateContent: (params) =>
        ai.models.generateContent(params as Parameters<typeof ai.models.generateContent>[0]),
      generateContentStream: (params) =>
        ai.models.generateContentStream(params as Parameters<typeof ai.models.generateContentStream>[0]),
      countTokens: (params) => ai.models.countTokens(params),
      list: (params) => ai.models.list(params),
    },
    caches: {
      create: (params) => ai.caches.create(params),
    },
  };
}
