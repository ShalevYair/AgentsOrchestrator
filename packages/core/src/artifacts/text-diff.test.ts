import { describe, expect, it } from "vitest";
import { diffLines, formatUnifiedDiff } from "./text-diff.js";

describe("diffLines", () => {
  it("reports every line as context when the two texts are identical", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(lines).toEqual([
      { kind: "context", text: "a" },
      { kind: "context", text: "b" },
      { kind: "context", text: "c" },
    ]);
  });

  it("reports every line as added when before is empty", () => {
    expect(diffLines("", "a\nb")).toEqual([
      { kind: "added", text: "a" },
      { kind: "added", text: "b" },
    ]);
  });

  it("reports every line as removed when after is empty", () => {
    expect(diffLines("a\nb", "")).toEqual([
      { kind: "removed", text: "a" },
      { kind: "removed", text: "b" },
    ]);
  });

  it("finds a single-line change in the middle, keeping context lines around it", () => {
    const lines = diffLines("a\nb\nc", "a\nX\nc");
    expect(lines).toEqual([
      { kind: "context", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "X" },
      { kind: "context", text: "c" },
    ]);
  });

  it("detects a pure insertion (line added, nothing removed)", () => {
    const lines = diffLines("a\nc", "a\nb\nc");
    expect(lines).toEqual([
      { kind: "context", text: "a" },
      { kind: "added", text: "b" },
      { kind: "context", text: "c" },
    ]);
  });

  it("is deterministic — same input always produces the same output", () => {
    const before = "line1\nline2\nline3\nline4";
    const after = "line1\nlineX\nline3\nline5";
    expect(diffLines(before, after)).toEqual(diffLines(before, after));
  });
});

describe("formatUnifiedDiff", () => {
  it("prefixes context/added/removed lines with space/+/-", () => {
    const text = formatUnifiedDiff([
      { kind: "context", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "X" },
    ]);
    expect(text).toBe(" a\n-b\n+X");
  });
});
