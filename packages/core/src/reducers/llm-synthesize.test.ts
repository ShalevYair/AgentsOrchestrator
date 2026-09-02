import { describe, expect, it } from "vitest";
import { makeLlmSynthesizeReducer } from "./llm-synthesize.js";
import type { TaskResult } from "./types.js";

describe("llm:synthesize", () => {
  it("always signals needsLlmStitch:true with the full stitchScope", () => {
    const reducer = makeLlmSynthesizeReducer<string, string>((inputs) =>
      inputs.map((r) => r.value).join(" "),
    );
    const inputs: TaskResult<string>[] = [
      { taskId: "t1", value: "a" },
      { taskId: "t2", value: "b" },
    ];
    const result = reducer(inputs, { stageId: "s1" });
    expect(result.needsLlmStitch).toBe(true);
    expect(result.stitchScope).toEqual(["t1", "t2"]);
    expect(result.value).toBe("a b");
    expect(result.gaps).toHaveLength(1);
  });

  it("never calls out to a provider itself — it's a pure fallback-value function", () => {
    let calls = 0;
    const reducer = makeLlmSynthesizeReducer<number, number>((inputs) => {
      calls += 1;
      return inputs.reduce((sum, r) => sum + r.value, 0);
    });
    reducer([{ taskId: "t1", value: 1 }], { stageId: "s1" });
    expect(calls).toBe(1); // only the caller-supplied fallback ran, synchronously, nothing async
  });
});
