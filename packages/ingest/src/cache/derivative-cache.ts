import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Content-addressed on-disk cache for artifact derivatives (chunks, RepoMap
 * fragments, summaries, index segments, ...). Every derivative is keyed by
 * the sha256 of its artifact plus a namespace, so re-ingesting the same
 * folder never recomputes anything whose inputs didn't change (P3-T7).
 */
export class DerivativeCache {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  #pathFor(namespace: string, key: string): string {
    const shard = key.slice(0, 2) || "00";
    return join(this.#root, namespace, shard, `${key}.json`);
  }

  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    try {
      const raw = await readFile(this.#pathFor(namespace, key), "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      if (isNotFound(err)) return undefined;
      throw err;
    }
  }

  async has(namespace: string, key: string): Promise<boolean> {
    return (await this.get(namespace, key)) !== undefined;
  }

  async set<T>(namespace: string, key: string, value: T): Promise<void> {
    const path = this.#pathFor(namespace, key);
    await mkdir(dirname(path), { recursive: true });
    // Write-then-rename keeps concurrent readers from ever observing a
    // partially written file (relevant once multiple extractors race).
    const tmpPath = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(value), "utf8");
    await rename(tmpPath, path);
  }

  /**
   * Returns the cached value if present; otherwise computes it, stores it,
   * and returns it. `compute` runs at most once per (namespace, key).
   */
  async getOrCompute<T>(namespace: string, key: string, compute: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(namespace, key);
    if (cached !== undefined) return cached;
    const value = await compute();
    await this.set(namespace, key, value);
    return value;
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}
