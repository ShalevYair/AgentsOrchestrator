import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_IGNORE_PATTERNS, buildMatcher, readIgnoreFile, scopePatternsToDir } from "./ignore-rules.js";

describe("DEFAULT_IGNORE_PATTERNS", () => {
  it("excludes node_modules and .git at any depth", () => {
    const matcher = buildMatcher([...DEFAULT_IGNORE_PATTERNS]);
    expect(matcher.ignores("node_modules/")).toBe(true);
    expect(matcher.ignores("packages/a/node_modules/")).toBe(true);
    expect(matcher.ignores(".git/")).toBe(true);
    expect(matcher.ignores("src/index.ts")).toBe(false);
  });
});

describe("readIgnoreFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ao-ignore-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns [] when the file doesn't exist", async () => {
    await expect(readIgnoreFile(dir, ".gitignore")).resolves.toEqual([]);
  });

  it("parses patterns, skipping blank lines and comments", async () => {
    await writeFile(join(dir, ".gitignore"), "*.log\n\n# comment\n  \n/build\n");
    await expect(readIgnoreFile(dir, ".gitignore")).resolves.toEqual(["*.log", "/build"]);
  });
});

describe("scopePatternsToDir", () => {
  it("leaves root-level patterns untouched", () => {
    expect(scopePatternsToDir(["*.log", "/build"], "")).toEqual(["*.log", "/build"]);
  });

  it("anchors nested patterns under the owning directory", () => {
    expect(scopePatternsToDir(["*.log"], "packages/a")).toEqual(["/packages/a/*.log"]);
    expect(scopePatternsToDir(["/build"], "packages/a")).toEqual(["/packages/a/build"]);
  });

  it("preserves negation when scoping", () => {
    expect(scopePatternsToDir(["!keep.log"], "packages/a")).toEqual(["!/packages/a/keep.log"]);
  });

  it("a nested .gitignore only affects paths inside its own subtree", () => {
    const scoped = scopePatternsToDir(["secrets.txt"], "packages/a");
    const matcher = buildMatcher(scoped);
    expect(matcher.ignores("packages/a/secrets.txt")).toBe(true);
    expect(matcher.ignores("packages/b/secrets.txt")).toBe(false);
    expect(matcher.ignores("secrets.txt")).toBe(false);
  });
});

describe(".aoignore composes with .gitignore", () => {
  it("both files' patterns apply together", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ao-ignore-compose-"));
    try {
      await writeFile(join(dir, ".gitignore"), "*.log\n");
      await writeFile(join(dir, ".aoignore"), "secrets/\n");
      const gitignore = await readIgnoreFile(dir, ".gitignore");
      const aoignore = await readIgnoreFile(dir, ".aoignore");
      const matcher = buildMatcher([...gitignore, ...aoignore]);
      expect(matcher.ignores("debug.log")).toBe(true);
      expect(matcher.ignores("secrets/")).toBe(true);
      expect(matcher.ignores("src/index.ts")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
