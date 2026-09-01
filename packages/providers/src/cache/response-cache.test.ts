import { describe, expect, it, vi } from "vitest";
import { ResponseCache, hashCacheKey } from "./response-cache.js";

const KEY = { model: "gemini-3.7-flash", params: { thinkingLevel: "low" }, prompt: "hello" };

describe("hashCacheKey", () => {
  it("is stable regardless of property insertion order in params", () => {
    const a = hashCacheKey({ model: "m", params: { a: 1, b: 2 }, prompt: "p" });
    const b = hashCacheKey({ model: "m", params: { b: 2, a: 1 }, prompt: "p" });
    expect(a).toBe(b);
  });

  it("differs when the prompt or model differs", () => {
    const a = hashCacheKey({ model: "m1", params: {}, prompt: "p" });
    const b = hashCacheKey({ model: "m2", params: {}, prompt: "p" });
    const c = hashCacheKey({ model: "m1", params: {}, prompt: "different" });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("ResponseCache", () => {
  it("an identical second call never invokes compute() again — a real cache hit, not just a stored value", async () => {
    const cache = new ResponseCache<string>();
    const compute = vi.fn().mockResolvedValue("computed-once");

    const first = await cache.getOrCompute(KEY, compute);
    const second = await cache.getOrCompute(KEY, compute);

    expect(first).toEqual({ value: "computed-once", cacheHit: false });
    expect(second).toEqual({ value: "computed-once", cacheHit: true });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("counts and reports hits and misses", async () => {
    const cache = new ResponseCache<string>();
    await cache.getOrCompute(KEY, () => Promise.resolve("v"));
    await cache.getOrCompute(KEY, () => Promise.resolve("v"));
    await cache.getOrCompute({ ...KEY, prompt: "other" }, () => Promise.resolve("v2"));

    expect(cache.stats()).toEqual({ hits: 1, misses: 2, size: 2 });
  });

  it("can be disabled outright — every call computes fresh and nothing is ever a hit", async () => {
    const cache = new ResponseCache<string>({ enabled: false });
    const compute = vi.fn().mockResolvedValue("v");

    await cache.getOrCompute(KEY, compute);
    await cache.getOrCompute(KEY, compute);

    expect(compute).toHaveBeenCalledTimes(2);
    expect(cache.stats()).toEqual({ hits: 0, misses: 0, size: 0 });
  });

  it("expires an entry after its TTL", async () => {
    let now = 0;
    const cache = new ResponseCache<string>({ ttlMs: 1000, now: () => now });
    const compute = vi.fn().mockResolvedValue("v");

    await cache.getOrCompute(KEY, compute);
    now += 500;
    await cache.getOrCompute(KEY, compute); // still fresh
    now += 600; // total 1100ms > ttl
    await cache.getOrCompute(KEY, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry once maxEntries is exceeded", () => {
    const cache = new ResponseCache<string>({ maxEntries: 2 });
    cache.set({ model: "m", params: {}, prompt: "a" }, "va");
    cache.set({ model: "m", params: {}, prompt: "b" }, "vb");
    cache.set({ model: "m", params: {}, prompt: "c" }, "vc");

    expect(cache.get({ model: "m", params: {}, prompt: "a" })).toBeUndefined();
    expect(cache.get({ model: "m", params: {}, prompt: "c" })).toBe("vc");
  });

  it("clear() empties the store", async () => {
    const cache = new ResponseCache<string>();
    await cache.getOrCompute(KEY, () => Promise.resolve("v"));
    cache.clear();
    expect(cache.stats().size).toBe(0);
  });
});
