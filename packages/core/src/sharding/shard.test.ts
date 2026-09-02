import { describe, expect, it } from "vitest";
import { buildShards, verifyShards, type ShardItem } from "./shard.js";

describe("buildShards — disjoint and covering", () => {
  it("returns zero shards for zero items", () => {
    expect(buildShards([], 3)).toEqual([]);
  });

  it("every input item appears in exactly one shard", () => {
    const items: ShardItem[] = Array.from({ length: 10 }, (_, i) => ({ id: `item-${String(i)}` }));
    const shards = buildShards(items, 3);
    expect(verifyShards(items, shards)).toHaveLength(0);
    const total = shards.reduce((sum, s) => sum + s.items.length, 0);
    expect(total).toBe(items.length);
  });

  it("keeps items sharing a groupKey together in the same shard", () => {
    const items: ShardItem[] = [
      { id: "a1", path: "src/auth/a.ts", groupKey: "auth" },
      { id: "a2", path: "src/auth/b.ts", groupKey: "auth" },
      { id: "b1", path: "src/billing/a.ts", groupKey: "billing" },
    ];
    const shards = buildShards(items, 2);
    const authShard = shards.find((s) => s.items.some((i) => i.groupKey === "auth"));
    expect(authShard?.items.map((i) => i.id).sort()).toEqual(["a1", "a2"]);
  });

  it("no two shards ever contain the same file path", () => {
    const items: ShardItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `f${String(i)}`,
      path: `src/module-${String(i % 4)}/file-${String(i)}.ts`,
      groupKey: `module-${String(i % 4)}`,
    }));
    const shards = buildShards(items, 4);
    const violations = verifyShards(items, shards);
    expect(violations.filter((v) => v.kind === "shared-file")).toHaveLength(0);
  });

  it("returns fewer shards than requested when there isn't enough distinct material", () => {
    const items: ShardItem[] = [{ id: "only-one" }];
    const shards = buildShards(items, 5);
    expect(shards).toHaveLength(1);
  });

  it("balances load roughly evenly across shards for equal-weight items", () => {
    const items: ShardItem[] = Array.from({ length: 20 }, (_, i) => ({ id: `item-${String(i)}` }));
    const shards = buildShards(items, 4);
    const counts = shards.map((s) => s.items.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("rejects a non-positive count", () => {
    expect(() => buildShards([{ id: "a" }], 0)).toThrow();
    expect(() => buildShards([{ id: "a" }], -1)).toThrow();
  });

  it("property: for many random item/count combinations, shards are always disjoint and covering", () => {
    let seed = 7;
    function nextRandom(): number {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    for (let trial = 0; trial < 200; trial++) {
      const itemCount = Math.floor(nextRandom() * 30);
      const groupCount = Math.max(1, Math.floor(nextRandom() * 8));
      const shardCount = Math.max(1, Math.floor(nextRandom() * 6));
      const items: ShardItem[] = Array.from({ length: itemCount }, (_, i) => ({
        id: `item-${String(trial)}-${String(i)}`,
        path: `src/g${String(i % groupCount)}/f${String(i)}.ts`,
        groupKey: `g${String(i % groupCount)}`,
        weight: 1 + Math.floor(nextRandom() * 5),
      }));
      const shards = buildShards(items, shardCount);
      const violations = verifyShards(items, shards);
      expect(violations).toHaveLength(0);
    }
  });
});
