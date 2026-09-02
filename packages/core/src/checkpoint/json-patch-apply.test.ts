import { describe, expect, it } from "vitest";
import { applyJsonPatch, JsonPatchApplyError } from "./json-patch-apply.js";

describe("applyJsonPatch", () => {
  it("applies replace", () => {
    const doc = { stages: [{ count: 6 }] };
    const result = applyJsonPatch(doc, [{ op: "replace", path: "/stages/0/count", value: 4 }]);
    expect(result).toEqual({ stages: [{ count: 4 }] });
    expect(doc).toEqual({ stages: [{ count: 6 }] }); // original untouched
  });

  it("applies add to an object and to an array (index and '-')", () => {
    const doc: { a: number; list: number[] } = { a: 1, list: [1, 2] };
    const result = applyJsonPatch(doc, [
      { op: "add", path: "/b", value: 2 },
      { op: "add", path: "/list/1", value: 99 },
      { op: "add", path: "/list/-", value: 100 },
    ]);
    expect(result).toEqual({ a: 1, b: 2, list: [1, 99, 2, 100] });
  });

  it("applies remove from an object and an array", () => {
    const doc = { a: 1, b: 2, list: [10, 20, 30] };
    const result = applyJsonPatch(doc, [
      { op: "remove", path: "/b" },
      { op: "remove", path: "/list/1" },
    ]);
    expect(result).toEqual({ a: 1, list: [10, 30] });
  });

  it("applies move", () => {
    const doc = { a: { x: 1 }, b: {} };
    const result = applyJsonPatch(doc, [{ op: "move", from: "/a/x", path: "/b/x" }]);
    expect(result).toEqual({ a: {}, b: { x: 1 } });
  });

  it("applies copy without removing the source", () => {
    const doc = { a: { x: 1 }, b: {} };
    const result = applyJsonPatch(doc, [{ op: "copy", from: "/a/x", path: "/b/x" }]);
    expect(result).toEqual({ a: { x: 1 }, b: { x: 1 } });
  });

  it("applies test successfully with no side effect, and fails on mismatch", () => {
    const doc = { a: 1 };
    expect(applyJsonPatch(doc, [{ op: "test", path: "/a", value: 1 }])).toEqual({ a: 1 });
    expect(() => applyJsonPatch(doc, [{ op: "test", path: "/a", value: 2 }])).toThrow(JsonPatchApplyError);
  });

  it("applies a sequence of ops in order", () => {
    const doc = { stages: [{ id: "s1", count: 6, maxParallel: 6 }] };
    const result = applyJsonPatch(doc, [
      { op: "replace", path: "/stages/0/count", value: 4 },
      { op: "replace", path: "/stages/0/maxParallel", value: 4 },
    ]);
    expect(result).toEqual({ stages: [{ id: "s1", count: 4, maxParallel: 4 }] });
  });

  it("throws JsonPatchApplyError naming the failing op index, applying nothing from that op onward", () => {
    const doc = { a: 1 };
    try {
      applyJsonPatch(doc, [
        { op: "replace", path: "/a", value: 2 },
        { op: "replace", path: "/missing/nested", value: 3 },
      ]);
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonPatchApplyError);
      expect((error as JsonPatchApplyError).opIndex).toBe(1);
    }
    expect(doc).toEqual({ a: 1 }); // original document never mutated
  });

  it("rejects replace on a key that doesn't already exist", () => {
    expect(() => applyJsonPatch({ a: 1 }, [{ op: "replace", path: "/b", value: 2 }])).toThrow(
      JsonPatchApplyError,
    );
  });

  it("rejects remove of a nonexistent array index", () => {
    expect(() => applyJsonPatch({ list: [1] }, [{ op: "remove", path: "/list/5" }])).toThrow(
      JsonPatchApplyError,
    );
  });
});
