import { createHash } from "node:crypto";
import type { CacheableContent, CacheRef, LLMProvider } from "@ao/shared";

/**
 * P1-T8: create/reuse/expire for the shared "Contract Block" prefix
 * (ARCHITECTURE.md §7 — the content identical across every Task in a
 * Stage's fan-out). `getOrCreate` is keyed by a hash of the exact
 * (model, contents, systemInstruction) prefix: N calls sharing that
 * prefix within its TTL call `provider.cacheCreate` exactly once — every
 * later call reuses the same `CacheRef` and the savings are counted, not
 * just assumed.
 */
export interface ContractCacheStats {
  created: number;
  reused: number;
  expired: number;
  /** Sum of `cachedTokenCount` across every *reused* hit — tokens not re-sent as a fresh prefix. */
  tokensSaved: number;
}

interface CacheEntry {
  ref: CacheRef;
  expiresAtMs: number;
  contentTokenCount: number;
}

function hashContractBlock(content: CacheableContent): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        model: content.model,
        contents: content.contents,
        systemInstruction: content.systemInstruction ?? null,
      }),
    )
    .digest("hex");
}

export class ContractCache {
  private readonly entries = new Map<string, CacheEntry>();
  /** In-flight creation per key — a fan-out's Tasks call getOrCreate concurrently, not sequentially, so without this every one of them would race past the (still-empty) `entries` check and each call `cacheCreate` itself. */
  private readonly inFlight = new Map<string, Promise<CacheRef>>();
  private readonly runningStats: ContractCacheStats = { created: 0, reused: 0, expired: 0, tokensSaved: 0 };

  constructor(
    private readonly provider: LLMProvider,
    private readonly now: () => number = Date.now,
  ) {}

  async getOrCreate(content: CacheableContent): Promise<CacheRef> {
    const key = hashContractBlock(content);
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.expiresAtMs > this.now()) {
        this.runningStats.reused += 1;
        this.runningStats.tokensSaved += existing.contentTokenCount;
        return existing.ref;
      }
      this.entries.delete(key);
      this.runningStats.expired += 1;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      this.runningStats.reused += 1;
      const ref = await pending;
      this.runningStats.tokensSaved += ref.cachedTokenCount ?? 0;
      return ref;
    }

    const creation = this.provider
      .cacheCreate(content)
      .then((ref) => {
        const contentTokenCount = ref.cachedTokenCount ?? 0;
        this.entries.set(key, {
          ref,
          expiresAtMs: this.now() + content.ttlSeconds * 1000,
          contentTokenCount,
        });
        this.runningStats.created += 1;
        return ref;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, creation);
    return creation;
  }

  stats(): ContractCacheStats {
    return { ...this.runningStats };
  }
}
