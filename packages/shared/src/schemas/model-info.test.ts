import { describe, expect, it } from "vitest";
import { ModelInfoSchema } from "./model-info.js";

describe("ModelInfoSchema", () => {
  it("accepts a well-formed live-catalog entry", () => {
    const result = ModelInfoSchema.safeParse({
      id: "gemini-3.7-flash",
      displayName: "Gemini 3.7 Flash",
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 64_000,
      supportsGenerate: true,
      supportsCountTokens: true,
      supportsCaching: true,
      supportsThinking: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown fields (strict object) and non-positive limits", () => {
    expect(
      ModelInfoSchema.safeParse({
        id: "x",
        displayName: "X",
        contextWindowTokens: 0,
        maxOutputTokens: 10,
        supportsGenerate: true,
        supportsCountTokens: true,
        supportsCaching: true,
        supportsThinking: true,
      }).success,
    ).toBe(false);

    expect(
      ModelInfoSchema.safeParse({
        id: "x",
        displayName: "X",
        contextWindowTokens: 10,
        maxOutputTokens: 10,
        supportsGenerate: true,
        supportsCountTokens: true,
        supportsCaching: true,
        supportsThinking: true,
        unexpected: "field",
      }).success,
    ).toBe(false);
  });
});
