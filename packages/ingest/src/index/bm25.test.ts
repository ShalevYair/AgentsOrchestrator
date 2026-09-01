import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bm25Index } from "./bm25.js";

describe("Bm25Index", () => {
  it("finds a document containing the query term, ranked over one that doesn't", () => {
    const index = new Bm25Index();
    index.addOrUpdate({ id: "a", text: "the AuthGuard handles authentication for every request" });
    index.addOrUpdate({ id: "b", text: "the database migration script runs on startup" });
    index.addOrUpdate({ id: "c", text: "authentication tokens expire after one hour by default" });

    const results = index.search("authentication");
    expect(results.map((r) => r.id)).toEqual(expect.arrayContaining(["a", "c"]));
    expect(results.map((r) => r.id)).not.toContain("b");
  });

  it("ranks a document mentioning the term more often higher", () => {
    const index = new Bm25Index();
    index.addOrUpdate({ id: "focused", text: "cache cache cache invalidation strategy" });
    index.addOrUpdate({ id: "incidental", text: "we should think about a cache eventually maybe" });

    const results = index.search("cache");
    expect(results[0]?.id).toBe("focused");
  });

  it("returns [] for an empty index or a query with no known terms", () => {
    const index = new Bm25Index();
    expect(index.search("anything")).toEqual([]);
    index.addOrUpdate({ id: "a", text: "hello world" });
    expect(index.search("")).toEqual([]);
    expect(index.search("   ")).toEqual([]);
  });

  it("tokenizes Hebrew and English together", () => {
    // No stemming/prefix-stripping — "ה" (definite article) attaches
    // directly to the Hebrew word, so a bare "אימות" search wouldn't match
    // "האימות". That's expected lexical-matching behavior, not a bug; the
    // word here is written without the prefix so the test isolates
    // "does mixed-script tokenization work" from "is there stemming".
    const index = new Bm25Index();
    index.addOrUpdate({ id: "a", text: "אימות (authentication) קורה בשכבת ה-guard" });
    index.addOrUpdate({ id: "b", text: "לוח הזמנים של הריצה" });
    expect(index.search("אימות").map((r) => r.id)).toContain("a");
    expect(index.search("authentication").map((r) => r.id)).toContain("a");
  });

  it("skips re-indexing an unchanged document (incremental)", () => {
    const index = new Bm25Index();
    const first = index.addOrUpdate({ id: "a", text: "unchanged content", contentHash: "h1" });
    const second = index.addOrUpdate({ id: "a", text: "unchanged content", contentHash: "h1" });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("re-indexes when content actually changed, and old terms stop matching", () => {
    const index = new Bm25Index();
    index.addOrUpdate({ id: "a", text: "old topic zebra", contentHash: "h1" });
    expect(index.search("zebra").map((r) => r.id)).toContain("a");

    const changed = index.addOrUpdate({ id: "a", text: "new topic giraffe", contentHash: "h2" });
    expect(changed).toBe(true);
    expect(index.search("zebra")).toEqual([]);
    expect(index.search("giraffe").map((r) => r.id)).toContain("a");
  });

  it("remove() drops a document from future search results", () => {
    const index = new Bm25Index();
    index.addOrUpdate({ id: "a", text: "unique-term-xyz appears here" });
    expect(index.search("unique-term-xyz").map((r) => r.id)).toContain("a");
    expect(index.remove("a")).toBe(true);
    expect(index.search("unique-term-xyz")).toEqual([]);
    expect(index.remove("a")).toBe(false);
  });

  it("respects the k limit", () => {
    const index = new Bm25Index();
    for (let i = 0; i < 20; i++) index.addOrUpdate({ id: `d${String(i)}`, text: "common term repeated" });
    expect(index.search("common", 5)).toHaveLength(5);
  });
});

describe("Bm25Index — persistence", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ao-bm25-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips through toJSON/fromJSON with identical search results", () => {
    const index = new Bm25Index();
    index.addOrUpdate({ id: "a", text: "authentication guard middleware" });
    index.addOrUpdate({ id: "b", text: "database connection pool" });

    const restored = Bm25Index.fromJSON(index.toJSON());
    expect(restored.size).toBe(index.size);
    expect(restored.search("authentication")).toEqual(index.search("authentication"));
  });

  it("round-trips through saveToFile/loadFromFile (saved to disk)", async () => {
    const index = new Bm25Index();
    index.addOrUpdate({ id: "a", text: "authentication guard middleware" });
    const path = join(dir, "index.json");

    await index.saveToFile(path);
    const restored = await Bm25Index.loadFromFile(path);

    expect(restored.search("authentication")).toEqual(index.search("authentication"));
  });
});

describe("Bm25Index — scale (P3-T6 done criterion)", () => {
  it("queries 100K chunks in under 200ms", () => {
    // A realistic vocabulary, not a tiny closed set: real code/prose has
    // thousands of distinct identifiers/words, so any given query term's
    // posting list stays a small fraction of the corpus — same as a real
    // chunk index. A 15-word vocab shared by every doc would make common
    // query terms match ~65% of the corpus, which is a pathological case
    // no real BM25 usage (or IDF weighting) is meant to be fast for.
    const vocabSize = 3000;
    const vocab = Array.from({ length: vocabSize }, (_, i) => `word${String(i)}`);

    const index = new Bm25Index();
    let seed = 42;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let i = 0; i < 100_000; i++) {
      const words: string[] = [];
      for (let w = 0; w < 15; w++) {
        words.push(vocab[Math.floor(rand() * vocab.length)] ?? "word0");
      }
      if (i % 20 === 0) words.push("budgetterm", "agentterm");
      if (i % 10_000 === 0) words.push("needleterm");
      index.addOrUpdate({ id: `chunk${String(i)}`, text: words.join(" ") });
    }

    expect(index.size).toBe(100_000);

    const start = performance.now();
    const results = index.search("needleterm budgetterm agentterm", 20);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(200);
    expect(results.length).toBeGreaterThan(0);
  }, 30_000);
});
