import type { CacheableContent } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "../mock/mock-provider.js";
import { ContractCache } from "./contract-cache.js";

function contractBlock(overrides: Partial<CacheableContent> = {}): CacheableContent {
  return {
    model: "gemini-3.7-flash",
    contents: [{ role: "user", parts: [{ text: "shared contract block prefix, identical for every task" }] }],
    ttlSeconds: 600,
    ...overrides,
  };
}

describe("ContractCache", () => {
  it("N calls sharing the same prefix produce exactly one cacheCreate call", async () => {
    const provider = new MockLLMProvider();
    const cache = new ContractCache(provider);
    const block = contractBlock();

    const refs = await Promise.all(Array.from({ length: 5 }, () => cache.getOrCreate(block)));

    expect(provider.calls.cacheCreate).toHaveLength(1);
    expect(new Set(refs.map((r) => r.name)).size).toBe(1);
    expect(cache.stats()).toMatchObject({ created: 1, reused: 4 });
  });

  it("measures and reports tokensSaved from actual reuse", async () => {
    const provider = new MockLLMProvider();
    const cache = new ContractCache(provider);
    const block = contractBlock();

    const first = await cache.getOrCreate(block);
    await cache.getOrCreate(block);
    await cache.getOrCreate(block);

    const stats = cache.stats();
    expect(stats.tokensSaved).toBe((first.cachedTokenCount ?? 0) * 2);
    expect(stats.tokensSaved).toBeGreaterThan(0);
  });

  it("a different prefix produces a separate cache entry", async () => {
    const provider = new MockLLMProvider();
    const cache = new ContractCache(provider);

    await cache.getOrCreate(contractBlock());
    await cache.getOrCreate(
      contractBlock({ contents: [{ role: "user", parts: [{ text: "a different prefix" }] }] }),
    );

    expect(provider.calls.cacheCreate).toHaveLength(2);
    expect(cache.stats()).toMatchObject({ created: 2, reused: 0 });
  });

  it("re-creates once the TTL expires, and counts the expiry", async () => {
    let now = 0;
    const provider = new MockLLMProvider();
    const cache = new ContractCache(provider, () => now);
    const block = contractBlock({ ttlSeconds: 60 });

    await cache.getOrCreate(block);
    now += 30_000; // still within TTL
    await cache.getOrCreate(block);
    expect(provider.calls.cacheCreate).toHaveLength(1);

    now += 40_000; // total 70s > 60s TTL
    await cache.getOrCreate(block);
    expect(provider.calls.cacheCreate).toHaveLength(2);
    expect(cache.stats()).toMatchObject({ created: 2, reused: 1, expired: 1 });
  });
});
