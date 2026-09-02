import { describe, expect, it } from "vitest";
import { makeReduceTreeReducer, reduceTree } from "./reduce-tree.js";
import type { TaskResult } from "./types.js";

describe("reduceTree", () => {
  it("returns `empty` for zero values", () => {
    expect(reduceTree<number>([], (a, b) => a + b, 0)).toBe(0);
  });

  it("returns the single value unchanged for one element", () => {
    expect(reduceTree<number>([7], (a, b) => a + b, 0)).toBe(7);
  });

  it("matches a sequential fold for an associative+commutative combiner (sum)", () => {
    const values = [1, 2, 3, 4, 5, 6, 7];
    const tree = reduceTree(values, (a, b) => a + b, 0);
    const sequential = values.reduce((a, b) => a + b, 0);
    expect(tree).toBe(sequential);
  });

  it("preserves left-to-right order for an order-sensitive associative combiner (concat)", () => {
    const values = [["a"], ["b"], ["c"], ["d"], ["e"]];
    const tree = reduceTree<string[]>(values, (a, b) => [...a, ...b], []);
    expect(tree).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("is deterministic across repeated calls with the same input", () => {
    const values = [1, 2, 3, 4, 5];
    const a = reduceTree(values, (x, y) => x * y, 1);
    const b = reduceTree(values, (x, y) => x * y, 1);
    expect(a).toBe(b);
  });
});

describe("makeReduceTreeReducer", () => {
  it("adapts reduceTree into the standard Reducer shape with no gaps and no LLM stitch", () => {
    const reducer = makeReduceTreeReducer<number>((a, b) => a + b, 0);
    const inputs: TaskResult<number>[] = [
      { taskId: "t1", value: 10 },
      { taskId: "t2", value: 20 },
      { taskId: "t3", value: 30 },
    ];
    const result = reducer(inputs, { stageId: "s1" });
    expect(result.value).toBe(60);
    expect(result.gaps).toHaveLength(0);
    expect(result.needsLlmStitch).toBe(false);
  });
});
