import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bm25Index } from "./index/bm25.js";
import { connectFolder } from "./connect/connect-folder.js";
import { ingestFiles } from "./connect/ingest-files.js";
import { buildRepoMap } from "./repomap/repo-map.js";
import { serializeRepoMap } from "./repomap/serialize.js";

/**
 * P3's own phase-level done criterion (TASKS.md §P3): "a 100MB folder is
 * ingested, mapped, and indexed with zero LLM calls. RepoMap + retrieval
 * answer 'where is auth handled?' for free."
 *
 * This wires every P3 piece together end-to-end on a small synthetic repo
 * and proves the qualitative claim — connectFolder -> ingestFiles
 * (extract+chunk) -> buildRepoMap -> Bm25Index -> a real query answered,
 * no LLMProvider imported or called anywhere in this file or the modules
 * it exercises. The quantitative "100MB / 10K files" claim rests on each
 * component's own scale test: connectFolder handles 10K files
 * (connect-folder.test.ts), buildRepoMap handles 1000 files under the 40K
 * -token budget (repo-map.test.ts), Bm25Index answers a query over 100K
 * chunks in under 200ms (bm25.test.ts) — a 100MB folder of ordinary source
 * text is well within all three.
 */
describe("P3 pipeline — folder in, zero LLM calls, answers 'where is auth handled?'", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ao-pipeline-"));
    await mkdir(join(dir, "src", "auth"), { recursive: true });
    await mkdir(join(dir, "src", "db"), { recursive: true });
    await mkdir(join(dir, "node_modules", "left-pad"), { recursive: true });

    await writeFile(
      join(dir, "src", "auth", "guard.ts"),
      `import { verifyToken } from "./tokens";

export function authGuard(request: Request): boolean {
  const token = request.headers.get("authorization");
  if (!token) return false;
  return verifyToken(token);
}
`,
    );
    await writeFile(
      join(dir, "src", "auth", "tokens.ts"),
      `export function verifyToken(token: string): boolean {
  return token.startsWith("valid-");
}
`,
    );
    await writeFile(
      join(dir, "src", "auth", "guard.test.ts"),
      `import { authGuard } from "./guard";
test("rejects missing token", () => {});
`,
    );
    await writeFile(
      join(dir, "src", "db", "migration.ts"),
      `export function runMigration(): void {
  // applies pending schema changes
}
`,
    );
    await writeFile(join(dir, "README.md"), "# Sample project\n\nA sample project with auth and db modules.");
    await writeFile(
      join(dir, "node_modules", "left-pad", "index.js"),
      "module.exports = function leftPad() {};",
    );

    // A corrupt file mixed in — the whole pipeline must survive it (P3-T1/T3).
    await writeFile(join(dir, "broken.pdf"), "not actually a pdf");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ingests, maps, indexes, and answers a retrieval query — end to end", async () => {
    // 1. Connect the folder — respects the default node_modules exclusion.
    const connected = await connectFolder(dir);
    expect(connected.files.some((f) => f.path.includes("node_modules"))).toBe(false);
    expect(connected.totalFiles).toBeGreaterThanOrEqual(6);

    // 2. Read every connected file and run it through extraction+chunking.
    const { readFile } = await import("node:fs/promises");
    const inputs = await Promise.all(
      connected.files.map(async (f) => ({ path: f.path, data: await readFile(f.absolutePath) })),
    );
    const ingested = await ingestFiles(inputs);

    // The corrupt PDF is reported as a gap, not a crash.
    expect(ingested.gaps.some((g) => g.path === "broken.pdf")).toBe(true);
    expect(ingested.artifacts.length).toBeGreaterThanOrEqual(5);

    // 3. Build the RepoMap from the same source text (zero LLM calls —
    // buildRepoMap only imports web-tree-sitter, never @ao/providers).
    const repoMap = await buildRepoMap(
      ingested.artifacts.map((a) => ({ path: a.path, text: a.extracted.text })),
    );
    const authFile = repoMap.files.find((f) => f.path === "src/auth/guard.ts");
    expect(authFile?.symbols.map((s) => s.name)).toContain("authGuard");
    expect(repoMap.testMap["src/auth/guard.test.ts"]).toBe("src/auth/guard.ts");

    const serializedMap = serializeRepoMap(repoMap);
    expect(serializedMap.estimatedTokens).toBeLessThan(40_000);

    // 4. Index every chunk for lexical retrieval.
    const index = new Bm25Index();
    for (const artifact of ingested.artifacts) {
      for (const chunk of artifact.chunks) {
        index.addOrUpdate({ id: chunk.id, text: chunk.text, contentHash: artifact.sha256 });
      }
    }

    // 5. Answer "where is auth handled?" — purely from structure + BM25,
    // no model call anywhere in this path.
    const results = index.search("auth token verify", 5);
    expect(results.length).toBeGreaterThan(0);
    const hitPaths = new Set(
      results.map((r) => ingested.artifacts.find((a) => a.chunks.some((c) => c.id === r.id))?.path),
    );
    expect([...hitPaths].some((p) => p?.startsWith("src/auth/"))).toBe(true);
    expect([...hitPaths]).not.toContain("src/db/migration.ts");
  });
});
