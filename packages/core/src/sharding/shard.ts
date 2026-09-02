import { ConfigError } from "@ao/shared";

/**
 * One unit of shardable work — a file, a module, a chunk, anything a
 * `shard`-mode Stage can hand exclusively to one Task. `groupKey` is the
 * cohesion unit: every item sharing a `groupKey` is always placed in the
 * same shard together, so a semantic unit (e.g. all files under one
 * module) never gets split across two Tasks. The Plan's `shardKey` (e.g.
 * `"module"`) names *which* grouping strategy to use; resolving that into
 * concrete `groupKey` values on each item is the caller's job (the
 * planner/agent-runner has the RepoMap or file list needed to compute it)
 * — this module stays agnostic to what a `groupKey` actually means.
 */
export interface ShardItem {
  id: string;
  /** File path this item touches, if any — the basis for the "no two Tasks share a file" invariant (ARCHITECTURE.md §4 / P5-T5's own done-criterion). */
  path?: string;
  /** Defaults to the item's own `id` — i.e. no cohesion beyond the item itself. */
  groupKey?: string;
  /** Relative sizing for load balancing across shards. Defaults to 1 (item-count balancing). */
  weight?: number;
}

export interface Shard {
  index: number;
  items: ShardItem[];
}

/**
 * P5-T5 — packs `items` into up to `count` shards that are disjoint
 * (every item appears in exactly one shard) and covering (every input item
 * appears in some shard), preserving `groupKey` cohesion. Uses a greedy
 * longest-processing-time-first bin-packing heuristic (sort groups by
 * descending total weight, always place the next group into the
 * currently-lightest shard) — simple, deterministic, and good enough at
 * the scale a single Stage's fan-out operates at (ARCHITECTURE.md §1's
 * goal-button ceilings top out at 12 concurrent agents).
 *
 * Returns fewer than `count` shards when there isn't enough distinct
 * material to fill them (an empty Task would violate a Stage's own
 * `successCriteria`, e.g. "לפחות ממצא אחד") — a caller that needs an exact
 * task count should check `shards.length` against `count` itself rather
 * than assume they always match. Zero items -> zero shards.
 */
export function buildShards(items: readonly ShardItem[], count: number): Shard[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new ConfigError(`buildShards requires a positive integer count, got ${String(count)}`);
  }

  const groups = new Map<string, ShardItem[]>();
  const groupOrder: string[] = [];
  for (const item of items) {
    const key = item.groupKey ?? item.id;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
      groupOrder.push(key);
    }
    group.push(item);
  }

  if (groupOrder.length === 0) return [];

  const weighted = groupOrder.map((key, index) => {
    const group = groups.get(key)!;
    const weight = group.reduce((sum, item) => sum + (item.weight ?? 1), 0);
    return { group, weight, index };
  });
  // Descending weight (largest groups placed first, for a better greedy
  // balance), tie-broken by original order so the result is deterministic.
  weighted.sort((a, b) => b.weight - a.weight || a.index - b.index);

  const actualCount = Math.max(1, Math.min(count, groupOrder.length));
  const shards: Shard[] = Array.from({ length: actualCount }, (_, index) => ({ index, items: [] }));
  const shardWeights = new Array<number>(actualCount).fill(0);

  for (const { group, weight } of weighted) {
    let target = 0;
    for (let i = 1; i < actualCount; i++) {
      if (shardWeights[i]! < shardWeights[target]!) target = i;
    }
    shards[target]!.items.push(...group);
    shardWeights[target] = shardWeights[target]! + weight;
  }

  return shards;
}

export interface ShardingViolation {
  kind: "not-covering" | "not-disjoint" | "shared-file";
  detail: string;
}

/**
 * Verifies the two properties P5-T5's done-criterion names explicitly:
 * shards are disjoint and covering relative to `items`, and no `path`
 * appears in more than one shard. `buildShards` is constructed to already
 * guarantee this, so a violation here signals a caller bug (e.g. two
 * distinct `groupKey`s that both legitimately claim the same file path) —
 * this function exists for exactly that defense-in-depth check, and is
 * what the property test in `shard.test.ts` asserts stays empty.
 */
export function verifyShards(items: readonly ShardItem[], shards: readonly Shard[]): ShardingViolation[] {
  const violations: ShardingViolation[] = [];
  const seenItemIds = new Map<string, number>();
  for (const shard of shards) {
    for (const item of shard.items) {
      const priorShard = seenItemIds.get(item.id);
      if (priorShard !== undefined) {
        violations.push({
          kind: "not-disjoint",
          detail: `item "${item.id}" appears in both shard ${String(priorShard)} and shard ${String(shard.index)}`,
        });
      }
      seenItemIds.set(item.id, shard.index);
    }
  }

  for (const item of items) {
    if (!seenItemIds.has(item.id)) {
      violations.push({ kind: "not-covering", detail: `item "${item.id}" appears in no shard` });
    }
  }

  const shardByPath = new Map<string, number>();
  for (const shard of shards) {
    for (const item of shard.items) {
      if (item.path === undefined) continue;
      const priorShard = shardByPath.get(item.path);
      if (priorShard !== undefined && priorShard !== shard.index) {
        violations.push({
          kind: "shared-file",
          detail: `path "${item.path}" appears in both shard ${String(priorShard)} and shard ${String(shard.index)}`,
        });
      } else {
        shardByPath.set(item.path, shard.index);
      }
    }
  }

  return violations;
}
