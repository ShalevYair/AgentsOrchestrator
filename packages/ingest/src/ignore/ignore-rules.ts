import ignoreFactory, { type Ignore } from "ignore";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Excluded even with no .gitignore present at all — matches at any depth
 * because these are unanchored gitignore patterns (P3-T2 done criterion:
 * "node_modules מוחרג כברירת מחדל"). */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  ".git/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  ".next/",
  ".turbo/",
  ".cache/",
  "out/",
  ".DS_Store",
  // The ignore files themselves are ingest configuration, not content.
  ".gitignore",
  ".aoignore",
];

export async function readIgnoreFile(dirAbsPath: string, filename: string): Promise<string[]> {
  try {
    const content = await readFile(join(dirAbsPath, filename), "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

/**
 * A .gitignore found at `<root>/<relDir>/.gitignore` only applies within
 * that subtree, and its anchored patterns (leading "/") are anchored to
 * that directory, not the connect-folder root. Rewriting each pattern to
 * be `/`-anchored under `relDir` lets every discovered ignore file be
 * merged into one flat pattern list while preserving that scoping — this
 * is the standard technique for composing nested .gitignore files with the
 * `ignore` package, which only matches against a single root.
 */
export function scopePatternsToDir(patterns: string[], relDir: string): string[] {
  if (relDir === "") return patterns;
  return patterns.map((pattern) => {
    const negated = pattern.startsWith("!");
    const body = negated ? pattern.slice(1) : pattern;
    const scoped = body.startsWith("/") ? `/${relDir}${body}` : `/${relDir}/${body}`;
    return negated ? `!${scoped}` : scoped;
  });
}

export function buildMatcher(patterns: string[]): Ignore {
  return ignoreFactory().add(patterns);
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}
