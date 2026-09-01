import { readFile, writeFile } from "node:fs/promises";
import { hashBuffer } from "../hash/sha256.js";

export interface Bm25Doc {
  id: string;
  text: string;
  /** Precomputed content hash, if the caller already has one (e.g. the
   * chunk's own sha256) — avoids hashing twice. */
  contentHash?: string;
}

export interface Bm25SearchResult {
  id: string;
  score: number;
}

export interface Bm25IndexOptions {
  k1?: number;
  b?: number;
}

interface SerializedBm25Index {
  k1: number;
  b: number;
  totalLength: number;
  docLengths: [string, number][];
  docHashes: [string, string][];
  postings: [string, [string, number][]][];
}

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

/**
 * A local, incremental, disk-persistable BM25 index (P3-T6) — no network,
 * no embeddings, just an inverted index over tokenized chunk text (ADR-007:
 * lexical + structure first, embeddings only if evals later show a gap).
 */
export class Bm25Index {
  readonly #k1: number;
  readonly #b: number;
  readonly #postings = new Map<string, Map<string, number>>(); // term -> docId -> tf
  readonly #docLengths = new Map<string, number>();
  readonly #docHashes = new Map<string, string>();
  readonly #docTerms = new Map<string, Set<string>>(); // for removing a doc's postings
  #totalLength = 0;

  constructor(options: Bm25IndexOptions = {}) {
    this.#k1 = options.k1 ?? 1.5;
    this.#b = options.b ?? 0.75;
  }

  get size(): number {
    return this.#docLengths.size;
  }

  get #avgDocLength(): number {
    return this.#docLengths.size === 0 ? 0 : this.#totalLength / this.#docLengths.size;
  }

  /**
   * Indexes (or re-indexes) one document. Returns false without touching
   * any postings if `contentHash` (or a hash computed from `text`) matches
   * what's already indexed for this id — this is what makes re-indexing a
   * folder after a small edit only pay for what actually changed.
   */
  addOrUpdate(doc: Bm25Doc): boolean {
    const hash = doc.contentHash ?? hashBuffer(doc.text);
    if (this.#docHashes.get(doc.id) === hash) return false;

    if (this.#docLengths.has(doc.id)) this.remove(doc.id);

    const terms = tokenize(doc.text);
    const tf = new Map<string, number>();
    for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + 1);

    this.#totalLength += terms.length;
    this.#docLengths.set(doc.id, terms.length);
    this.#docHashes.set(doc.id, hash);
    this.#docTerms.set(doc.id, new Set(tf.keys()));

    for (const [term, count] of tf) {
      let posting = this.#postings.get(term);
      if (!posting) {
        posting = new Map();
        this.#postings.set(term, posting);
      }
      posting.set(doc.id, count);
    }
    return true;
  }

  remove(id: string): boolean {
    if (!this.#docLengths.has(id)) return false;

    for (const term of this.#docTerms.get(id) ?? []) {
      const posting = this.#postings.get(term);
      if (posting?.delete(id) && posting.size === 0) this.#postings.delete(term);
    }
    this.#totalLength -= this.#docLengths.get(id) ?? 0;
    this.#docLengths.delete(id);
    this.#docHashes.delete(id);
    this.#docTerms.delete(id);
    return true;
  }

  search(query: string, k = 10): Bm25SearchResult[] {
    const queryTerms = new Set(tokenize(query));
    if (queryTerms.size === 0 || this.#docLengths.size === 0) return [];

    const n = this.#docLengths.size;
    const avgdl = this.#avgDocLength;
    const scores = new Map<string, number>();

    for (const term of queryTerms) {
      const posting = this.#postings.get(term);
      if (!posting) continue;
      const df = posting.size;
      const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);

      for (const [docId, tf] of posting) {
        const docLength = this.#docLengths.get(docId) ?? 0;
        const denom = tf + this.#k1 * (1 - this.#b + this.#b * (docLength / avgdl));
        scores.set(docId, (scores.get(docId) ?? 0) + idf * ((tf * (this.#k1 + 1)) / denom));
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id, score]) => ({ id, score }));
  }

  toJSON(): SerializedBm25Index {
    return {
      k1: this.#k1,
      b: this.#b,
      totalLength: this.#totalLength,
      docLengths: [...this.#docLengths],
      docHashes: [...this.#docHashes],
      postings: [...this.#postings].map(([term, posting]) => [term, [...posting]]),
    };
  }

  static fromJSON(data: SerializedBm25Index): Bm25Index {
    const index = new Bm25Index({ k1: data.k1, b: data.b });
    index.#totalLength = data.totalLength;
    for (const [id, length] of data.docLengths) index.#docLengths.set(id, length);
    for (const [id, hash] of data.docHashes) index.#docHashes.set(id, hash);
    for (const [term, posting] of data.postings) {
      const map = new Map(posting);
      index.#postings.set(term, map);
      for (const docId of map.keys()) {
        let terms = index.#docTerms.get(docId);
        if (!terms) {
          terms = new Set();
          index.#docTerms.set(docId, terms);
        }
        terms.add(term);
      }
    }
    return index;
  }

  async saveToFile(path: string): Promise<void> {
    await writeFile(path, JSON.stringify(this.toJSON()), "utf8");
  }

  static async loadFromFile(path: string): Promise<Bm25Index> {
    const raw = await readFile(path, "utf8");
    return Bm25Index.fromJSON(JSON.parse(raw) as SerializedBm25Index);
  }
}
