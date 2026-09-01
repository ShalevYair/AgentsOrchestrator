import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DerivativeCache } from "./derivative-cache.js";

describe("DerivativeCache", () => {
  let dir: string;
  let cache: DerivativeCache;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ao-cache-"));
    cache = new DerivativeCache(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns undefined for a miss", async () => {
    await expect(cache.get("chunks", "deadbeef")).resolves.toBeUndefined();
    await expect(cache.has("chunks", "deadbeef")).resolves.toBe(false);
  });

  it("round-trips a set/get", async () => {
    await cache.set("chunks", "abc123", { hello: "world" });
    await expect(cache.get("chunks", "abc123")).resolves.toEqual({ hello: "world" });
    await expect(cache.has("chunks", "abc123")).resolves.toBe(true);
  });

  it("getOrCompute only invokes compute() once per key", async () => {
    const compute = vi.fn().mockResolvedValue({ summary: "expensive" });

    const first = await cache.getOrCompute("summaries", "hash1", compute);
    const second = await cache.getOrCompute("summaries", "hash1", compute);

    expect(first).toEqual({ summary: "expensive" });
    expect(second).toEqual({ summary: "expensive" });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("isolates namespaces", async () => {
    await cache.set("ns-a", "key", "value-a");
    await cache.set("ns-b", "key", "value-b");
    await expect(cache.get("ns-a", "key")).resolves.toBe("value-a");
    await expect(cache.get("ns-b", "key")).resolves.toBe("value-b");
  });

  it("survives a fresh DerivativeCache pointed at the same root", async () => {
    await cache.set("chunks", "persisted", [1, 2, 3]);
    const reopened = new DerivativeCache(dir);
    await expect(reopened.get("chunks", "persisted")).resolves.toEqual([1, 2, 3]);
  });
});
