import { describe, expect, it } from "vitest";
import { ReducerIdSchema, isLlmReducer } from "./reducer.js";

describe("ReducerIdSchema", () => {
  it("accepts every reducer id documented in PROTOCOLS.md §8", () => {
    for (const id of [
      "local:concat-ordered",
      "local:dedupe-findings",
      "local:vote",
      "local:assemble-files",
      "local:reduce-tree",
      "llm:synthesize",
    ]) {
      expect(() => ReducerIdSchema.parse(id)).not.toThrow();
    }
  });

  it("rejects an id outside the closed registry", () => {
    expect(() => ReducerIdSchema.parse("local:made-up")).toThrow();
  });
});

describe("isLlmReducer", () => {
  it("is true only for the llm:synthesize reducer", () => {
    expect(isLlmReducer("llm:synthesize")).toBe(true);
  });

  it("is false for every local:* reducer", () => {
    expect(isLlmReducer("local:concat-ordered")).toBe(false);
    expect(isLlmReducer("local:dedupe-findings")).toBe(false);
    expect(isLlmReducer("local:vote")).toBe(false);
    expect(isLlmReducer("local:assemble-files")).toBe(false);
    expect(isLlmReducer("local:reduce-tree")).toBe(false);
  });
});
