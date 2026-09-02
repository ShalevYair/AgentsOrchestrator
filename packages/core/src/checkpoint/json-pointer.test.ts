import { describe, expect, it } from "vitest";
import { parsePointer, resolvePointer } from "./json-pointer.js";

describe("parsePointer", () => {
  it("parses the empty pointer as the whole document", () => {
    expect(parsePointer("")).toEqual([]);
  });

  it("splits nested segments", () => {
    expect(parsePointer("/stages/2/fanout/count")).toEqual(["stages", "2", "fanout", "count"]);
  });

  it("decodes ~1 to / and ~0 to ~", () => {
    expect(parsePointer("/a~1b/c~0d")).toEqual(["a/b", "c~d"]);
  });

  it("rejects a pointer that doesn't start with /", () => {
    expect(() => parsePointer("stages/0")).toThrow();
  });
});

describe("resolvePointer", () => {
  const doc = {
    stages: [
      { id: "s1", fanout: { count: 3 } },
      { id: "s2", fanout: { count: 1 } },
    ],
  };

  it("resolves the root for the empty pointer", () => {
    const result = resolvePointer(doc, "");
    expect(result).toEqual({ found: true, value: doc });
  });

  it("resolves a nested array + object path", () => {
    expect(resolvePointer(doc, "/stages/0/fanout/count")).toEqual({ found: true, value: 3 });
  });

  it("reports not-found for a missing object key", () => {
    expect(resolvePointer(doc, "/stages/0/missing")).toEqual({ found: false });
  });

  it("reports not-found for an out-of-range array index", () => {
    expect(resolvePointer(doc, "/stages/9/id")).toEqual({ found: false });
  });

  it("reports not-found when walking into a primitive", () => {
    expect(resolvePointer(doc, "/stages/0/id/nope")).toEqual({ found: false });
  });
});
