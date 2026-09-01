import { createHash } from "node:crypto";

/** Recursively sorts object keys so hashing is independent of property insertion order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface ResponseCacheKeyInput {
  model: string;
  params: Record<string, unknown>;
  prompt: string;
}

/** P1-T6: keyed by hash of (model, params, prompt). Exported so callers can dedupe by key without going through the cache. */
export function hashCacheKey(input: ResponseCacheKeyInput): string {
  return createHash("sha256")
    .update(stableStringify({ model: input.model, params: input.params, prompt: input.prompt }))
    .digest("hex");
}

export interface ResponseCacheOptions {
  /** Default true. Set false to disable caching outright (P1-T6's "can be disabled" criterion) without callers branching. */
  enabled?: boolean;
  ttlMs?: number;
  /** Simple bound on unbounded growth: oldest entry is evicted once this is exceeded. */
  maxEntries?: number;
  now?: () => number;
}

export interface ResponseCacheStats {
  hits: number;
  misses: number;
  size: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;

/**
 * Local response cache (P1-T6). Generic over the cached value so
 * `GeminiProvider` can cache the whole materialized delta sequence of a
 * `generate()` call, not just plain text — a cache hit on a streaming call
 * replays the stored deltas instead of touching the network at all.
 */
export class ResponseCache<T> {
  private readonly enabled: boolean;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly store = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;

  constructor(options: ResponseCacheOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get(input: ResponseCacheKeyInput): T | undefined {
    if (!this.enabled) return undefined;
    const key = hashCacheKey(input);
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry.value;
  }

  set(input: ResponseCacheKeyInput, value: T): void {
    if (!this.enabled) return;
    const key = hashCacheKey(input);
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /** Returns the cached value and records a hit/miss, or computes+stores it via `compute` on a miss. */
  async getOrCompute(
    input: ResponseCacheKeyInput,
    compute: () => Promise<T>,
  ): Promise<{ value: T; cacheHit: boolean }> {
    const cached = this.get(input);
    if (cached !== undefined) {
      return { value: cached, cacheHit: true };
    }
    const value = await compute();
    this.set(input, value);
    return { value, cacheHit: false };
  }

  stats(): ResponseCacheStats {
    return { hits: this.hits, misses: this.misses, size: this.store.size };
  }

  clear(): void {
    this.store.clear();
  }
}
