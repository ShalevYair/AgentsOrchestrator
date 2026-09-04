import { describe, expect, it } from "vitest";
import { BUILTIN_REDUCER_IDS, ReducerIdSchema, isLlmReducer } from "./reducer.js";

describe("BUILTIN_REDUCER_IDS", () => {
  it("lists every reducer id documented in PROTOCOLS.md §8", () => {
    expect(BUILTIN_REDUCER_IDS).toEqual([
      "local:concat-ordered",
      "local:dedupe-findings",
      "local:vote",
      "local:assemble-files",
      "local:reduce-tree",
      "llm:synthesize",
    ]);
  });
});

describe("ReducerIdSchema", () => {
  it("accepts every built-in reducer id", () => {
    for (const id of BUILTIN_REDUCER_IDS) {
      expect(() => ReducerIdSchema.parse(id)).not.toThrow();
    }
  });

  it("accepts a custom (non-built-in) reducer id — P10-T6's whole point: mergeStrategy is open, same as agentType", () => {
    expect(ReducerIdSchema.parse("custom:my-team-reducer")).toBe("custom:my-team-reducer");
  });

  it("still rejects an empty string", () => {
    expect(() => ReducerIdSchema.parse("")).toThrow();
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

  it("is false for a custom reducer id that doesn't use the llm: prefix", () => {
    expect(isLlmReducer("custom:my-team-reducer")).toBe(false);
  });
});
