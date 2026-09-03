import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectSandbox } from "../sandbox/detect.js";
import { runNodeTool } from "../runtime/node-runner.js";
import { matchLibraryTool } from "./registry.js";

describe("library tools (source: registry, executed for real via runNodeTool)", () => {
  let dir: string;
  let stagingRoot: string;
  const sandbox = detectSandbox();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ao-library-corpus-"));
    stagingRoot = mkdtempSync(join(tmpdir(), "ao-library-staging-"));
    writeFileSync(join(dir, "a.ts"), "import { target } from 'x';\nexport const a = 1;\n", "utf8");
    writeFileSync(join(dir, "b.ts"), "export const b = 2;\n", "utf8");
    writeFileSync(join(dir, "c.md"), "target mentioned in prose, not code\n", "utf8");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(stagingRoot, { recursive: true, force: true });
  });

  it("every library tool is marked source: registry, not inline", () => {
    const tool = matchLibraryTool({ kind: "file-stats", params: { dir } });
    expect(tool.source).toBe("registry");
  });

  it("count-files-matching counts files whose content matches a pattern", async () => {
    const tool = matchLibraryTool({ kind: "count-files-matching", params: { dir, pattern: "target" } });
    const result = await runNodeTool({ tool, sandbox, stagingRoot });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ count: 2 }); // a.ts and c.md both contain "target"
  });

  it("count-files-matching respects an extension filter", async () => {
    const tool = matchLibraryTool({
      kind: "count-files-matching",
      params: { dir, pattern: "target", extensions: [".ts"] },
    });
    const result = await runNodeTool({ tool, sandbox, stagingRoot });
    expect(result.data).toEqual({ count: 1 }); // only a.ts, c.md excluded by extension
  });

  it("grep returns file+line matches and an honest total when capped", async () => {
    const tool = matchLibraryTool({ kind: "grep", params: { dir, pattern: "target", maxMatches: 1 } });
    const result = await runNodeTool({ tool, sandbox, stagingRoot });
    const data = result.data as { totalMatches: number; matches: unknown[]; truncatedMatchList: boolean };
    expect(data.totalMatches).toBe(2);
    expect(data.matches).toHaveLength(1);
    expect(data.truncatedMatchList).toBe(true);
  });

  it("file-stats reports file count, total bytes, and a per-extension breakdown", async () => {
    const tool = matchLibraryTool({ kind: "file-stats", params: { dir } });
    const result = await runNodeTool({ tool, sandbox, stagingRoot });
    const data = result.data as { fileCount: number; byExtension: Record<string, { count: number }> };
    expect(data.fileCount).toBe(3);
    expect(data.byExtension[".ts"]?.count).toBe(2);
    expect(data.byExtension[".md"]?.count).toBe(1);
  });

  it("count-identifier-occurrences uses word boundaries, not substring matching", async () => {
    writeFileSync(join(dir, "d.ts"), "const targeting = 1; // substring only, should not match\n", "utf8");
    const tool = matchLibraryTool({
      kind: "count-identifier-occurrences",
      params: { dir, identifier: "target" },
    });
    const result = await runNodeTool({ tool, sandbox, stagingRoot });
    const data = result.data as { occurrences: number; filesWithOccurrence: number };
    // "target" appears as a whole word in a.ts and c.md; "targeting" in d.ts must NOT count.
    expect(data.occurrences).toBe(2);
    expect(data.filesWithOccurrence).toBe(2);
  });

  it("json-array-to-csv converts an array of flat objects, unioning columns across rows", async () => {
    const jsonFilePath = join(dir, "rows.json");
    writeFileSync(
      jsonFilePath,
      JSON.stringify([
        { a: 1, b: "x" },
        { a: 2, c: "y" },
      ]),
      "utf8",
    );
    const tool = matchLibraryTool({ kind: "json-array-to-csv", params: { jsonFilePath } });
    const result = await runNodeTool({ tool, sandbox, stagingRoot });
    const data = result.data as { csv: string; rowCount: number; columns: string[] };
    expect(data.rowCount).toBe(2);
    expect(data.columns.sort()).toEqual(["a", "b", "c"]);
    expect(data.csv).toContain("1,x,");
  });
});
