import type { Usage } from "@ao/shared";

/**
 * Normalizes Gemini's `usageMetadata` (verified against
 * `GenerateContentResponseUsageMetadata` in the installed `@google/genai`
 * 2.20.0 type definitions: `promptTokenCount`, `candidatesTokenCount`,
 * `cachedContentTokenCount`, `thoughtsTokenCount`, `toolUsePromptTokenCount`,
 * `totalTokenCount`) into this repo's `Usage` shape
 * (`packages/shared/src/schemas/common.ts`). Any field the SDK omits is
 * treated as 0, never as "unknown" — a real Gemini response always sets
 * `promptTokenCount`/`candidatesTokenCount`/`totalTokenCount`, and the
 * others (`thoughtsTokenCount`, `cachedContentTokenCount`) are legitimately
 * absent when thinking or caching weren't involved in that call.
 */
export interface GeminiUsageMetadataLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
}

export function normalizeUsage(metadata: GeminiUsageMetadataLike | undefined): Usage {
  return {
    promptTokens: metadata?.promptTokenCount ?? 0,
    candidatesTokens: metadata?.candidatesTokenCount ?? 0,
    thoughtsTokens: metadata?.thoughtsTokenCount ?? 0,
    cachedTokens: metadata?.cachedContentTokenCount ?? 0,
  };
}
