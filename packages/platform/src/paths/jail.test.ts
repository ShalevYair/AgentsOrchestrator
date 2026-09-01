import { sep } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPathLength, resolveWithinRoot } from "./jail.js";

const ROOT = `${sep}base${sep}staging`;

describe("resolveWithinRoot", () => {
  it("accepts a simple nested path", () => {
    const result = resolveWithinRoot(ROOT, `sub${sep}dir${sep}file.ts`);
    expect(result.ok).toBe(true);
    expect(result.resolvedPath).toBe(`${ROOT}${sep}sub${sep}dir${sep}file.ts`);
  });

  it("accepts the root itself", () => {
    expect(resolveWithinRoot(ROOT, ".").ok).toBe(true);
  });

  it("rejects a classic ../ traversal out of the root", () => {
    const result = resolveWithinRoot(ROOT, `..${sep}..${sep}etc${sep}passwd`);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/escapes/);
  });

  it("rejects a multi-hop traversal that net-escapes even after going deeper first", () => {
    const result = resolveWithinRoot(ROOT, `sub${sep}..${sep}..${sep}..${sep}etc${sep}passwd`);
    expect(result.ok).toBe(false);
  });

  it("rejects an absolute path substituted in place of a relative candidate", () => {
    const result = resolveWithinRoot(ROOT, `${sep}etc${sep}passwd`);
    expect(result.ok).toBe(false);
  });

  it("does not mistake a sibling directory that shares the root as a string prefix for being inside it", () => {
    // "/base/stagingX" is NOT inside "/base/staging" even though the raw
    // string "/base/staging" is a prefix of "/base/stagingX" — the
    // trailing-separator comparison in resolveWithinRoot must catch this.
    const siblingRoot = `${sep}base${sep}stagingX`;
    const result = resolveWithinRoot(ROOT, `..${sep}stagingX${sep}evil.txt`);
    expect(result.resolvedPath.startsWith(siblingRoot)).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("treats differently-cased paths as equivalent (Windows/macOS case-insensitive filesystems)", () => {
    // Even though this test runs on a case-sensitive filesystem, the jail's
    // own comparison policy must be case-insensitive so it behaves
    // identically once shipped to Windows/macOS, where a case-sensitive
    // prefix check would be bypassable.
    const mixedCaseRoot = `${sep}Base${sep}Staging`;
    const result = resolveWithinRoot(mixedCaseRoot, `${sep}base${sep}staging${sep}file.ts`);
    expect(result.ok).toBe(true);
  });

  it("still rejects an escape attempt that only differs from the root by case", () => {
    const mixedCaseRoot = `${sep}Base${sep}Staging`;
    const result = resolveWithinRoot(mixedCaseRoot, `${sep}BASE${sep}OTHER${sep}evil.txt`);
    expect(result.ok).toBe(false);
  });
});

describe("checkPathLength", () => {
  it("accepts a short path", () => {
    const check = checkPathLength(`${sep}base${sep}staging${sep}file.ts`);
    expect(check.ok).toBe(true);
  });

  it("flags a path longer than the recommended Windows-safe limit", () => {
    const longPath = sep + "a".repeat(300);
    const check = checkPathLength(longPath);
    expect(check.ok).toBe(false);
    expect(check.length).toBe(longPath.length);
  });
});
