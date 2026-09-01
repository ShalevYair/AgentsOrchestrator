import { describe, expect, it } from "vitest";
import { normalizeUsage } from "./usage.js";

describe("normalizeUsage", () => {
  it("maps every Gemini usageMetadata field to the repo's Usage shape", () => {
    expect(
      normalizeUsage({
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        cachedContentTokenCount: 20,
        thoughtsTokenCount: 10,
      }),
    ).toEqual({
      promptTokens: 100,
      candidatesTokens: 50,
      thoughtsTokens: 10,
      cachedTokens: 20,
    });
  });

  it("defaults every field to 0 rather than undefined, for an absent usageMetadata", () => {
    expect(normalizeUsage(undefined)).toEqual({
      promptTokens: 0,
      candidatesTokens: 0,
      thoughtsTokens: 0,
      cachedTokens: 0,
    });
  });

  it("defaults omitted individual fields to 0 (e.g. no thinking, no cache hit on this call)", () => {
    expect(normalizeUsage({ promptTokenCount: 5, candidatesTokenCount: 3 })).toEqual({
      promptTokens: 5,
      candidatesTokens: 3,
      thoughtsTokens: 0,
      cachedTokens: 0,
    });
  });
});
