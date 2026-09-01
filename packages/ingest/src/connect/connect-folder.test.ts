import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectFolder } from "./connect-folder.js";

describe("connectFolder", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ao-connect-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("excludes node_modules by default even with no .gitignore present", async () => {
    await mkdir(join(dir, "node_modules", "left-pad"), { recursive: true });
    await writeFile(join(dir, "node_modules", "left-pad", "index.js"), "module.exports = {};");
    await writeFile(join(dir, "src.ts"), "export const x = 1;");

    const result = await connectFolder(dir);
    expect(result.files.map((f) => f.path)).toEqual(["src.ts"]);
    expect(result.ignoredCount).toBeGreaterThanOrEqual(1);
  });

  it("respects a root .gitignore", async () => {
    await writeFile(join(dir, ".gitignore"), "*.log\n/secrets\n");
    await writeFile(join(dir, "app.log"), "log contents");
    await writeFile(join(dir, "app.ts"), "code");
    await mkdir(join(dir, "secrets"));
    await writeFile(join(dir, "secrets", "key.txt"), "shh");

    const result = await connectFolder(dir);
    expect(result.files.map((f) => f.path).sort()).toEqual(["app.ts"]);
  });

  it("a nested .gitignore only applies within its own subtree", async () => {
    await mkdir(join(dir, "packages", "a"), { recursive: true });
    await mkdir(join(dir, "packages", "b"), { recursive: true });
    await writeFile(join(dir, "packages", "a", ".gitignore"), "local.txt\n");
    await writeFile(join(dir, "packages", "a", "local.txt"), "ignored here");
    await writeFile(join(dir, "packages", "b", "local.txt"), "kept here");

    const result = await connectFolder(dir);
    const paths = result.files.map((f) => f.path).sort();
    expect(paths).toContain("packages/b/local.txt");
    expect(paths).not.toContain("packages/a/local.txt");
  });

  it("composes .gitignore and .aoignore", async () => {
    await writeFile(join(dir, ".gitignore"), "*.log\n");
    await writeFile(join(dir, ".aoignore"), "*.secret\n");
    await writeFile(join(dir, "a.log"), "x");
    await writeFile(join(dir, "a.secret"), "x");
    await writeFile(join(dir, "a.ts"), "x");

    const result = await connectFolder(dir);
    expect(result.files.map((f) => f.path)).toEqual(["a.ts"]);
  });

  it("extraIgnorePatterns can force-include something .gitignore excludes", async () => {
    await writeFile(join(dir, ".gitignore"), "*.log\n");
    await writeFile(join(dir, "keep.log"), "x");

    const result = await connectFolder(dir, { extraIgnorePatterns: ["!keep.log"] });
    expect(result.files.map((f) => f.path)).toEqual(["keep.log"]);
  });

  it("builds a sized tree alongside the flat file list", async () => {
    await mkdir(join(dir, "sub"));
    await writeFile(join(dir, "a.ts"), "12345"); // 5 bytes
    await writeFile(join(dir, "sub", "b.ts"), "1234567890"); // 10 bytes

    const result = await connectFolder(dir);
    expect(result.totalBytes).toBe(15);
    expect(result.tree.sizeBytes).toBe(15);
    const sub = result.tree.children?.find((c) => c.name === "sub");
    expect(sub?.sizeBytes).toBe(10);
  });

  it("reports progress incrementally, not just once at the end", async () => {
    for (let i = 0; i < 20; i++) {
      await writeFile(join(dir, `f${String(i)}.ts`), "x");
    }
    const progressCalls: number[] = [];
    await connectFolder(dir, {
      onProgress: (p) => progressCalls.push(p.filesScanned),
    });
    expect(progressCalls.length).toBe(20);
    expect(progressCalls).toEqual([...progressCalls].sort((a, b) => a - b));
  });

  it("aborts cleanly via AbortSignal", async () => {
    await writeFile(join(dir, "a.ts"), "x");
    await writeFile(join(dir, "b.ts"), "x");
    const controller = new AbortController();
    controller.abort();
    await expect(connectFolder(dir, { signal: controller.signal })).rejects.toThrow(/abort/i);
  });

  it("scans 10,000 files without throwing or hanging (P3-T2 done criterion)", async () => {
    const fileCount = 10_000;
    const perDir = 200;
    const dirs = Math.ceil(fileCount / perDir);
    for (let d = 0; d < dirs; d++) {
      const subdir = join(dir, `d${String(d)}`);
      await mkdir(subdir);
      const writes: Promise<void>[] = [];
      for (let f = 0; f < perDir && d * perDir + f < fileCount; f++) {
        writes.push(writeFile(join(subdir, `f${String(f)}.ts`), "x"));
      }
      await Promise.all(writes);
    }

    const start = Date.now();
    const result = await connectFolder(dir);
    const elapsedMs = Date.now() - start;

    expect(result.totalFiles).toBe(fileCount);
    expect(elapsedMs).toBeLessThan(20_000);
  }, 60_000);
});
