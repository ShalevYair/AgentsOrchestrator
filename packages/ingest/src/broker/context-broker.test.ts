import { describe, expect, it } from "vitest";
import { selectContext, type ContextItem, type ContextPriority } from "./context-broker.js";
import { estimateTokens, type TokenKind } from "../tokens/estimate-tokens.js";

describe("selectContext", () => {
  it("includes everything when it all fits under budget", () => {
    const items: ContextItem[] = [
      { id: "a", priority: 1, text: "x".repeat(40) },
      { id: "b", priority: 3, text: "y".repeat(40) },
    ];
    const result = selectContext(items, 1000);
    expect(result.included.map((i) => i.id)).toEqual(["a", "b"]);
    expect(result.cut).toEqual([]);
  });

  it("fills strictly in priority order — a lower tier never displaces a higher one", () => {
    const items: ContextItem[] = [
      { id: "background", priority: 5, tokens: 10, text: "" },
      { id: "contract", priority: 1, tokens: 10, text: "" },
      { id: "shard", priority: 2, tokens: 10, text: "" },
      { id: "evidence", priority: 3, tokens: 10, text: "" },
    ];
    const result = selectContext(items, 25);
    expect(result.included.map((i) => i.id)).toEqual(["contract", "shard"]);
    expect(result.cut.map((c) => c.id)).toEqual(expect.arrayContaining(["evidence", "background"]));
  });

  it("skips one oversized item but keeps filling with smaller lower-priority ones", () => {
    const items: ContextItem[] = [
      { id: "huge-evidence", priority: 3, tokens: 90, text: "" },
      { id: "small-finding", priority: 4, tokens: 5, text: "" },
    ];
    const result = selectContext(items, 10);
    expect(result.included.map((i) => i.id)).toEqual(["small-finding"]);
    expect(result.cut[0]).toMatchObject({ id: "huge-evidence", reason: "over-budget" });
  });

  it("preserves original relative order within the same priority tier", () => {
    const items: ContextItem[] = [
      { id: "e2", priority: 3, tokens: 1, text: "" },
      { id: "e1", priority: 3, tokens: 1, text: "" },
      { id: "e3", priority: 3, tokens: 1, text: "" },
    ];
    const result = selectContext(items, 1000);
    expect(result.included.map((i) => i.id)).toEqual(["e2", "e1", "e3"]);
  });

  it("reports totalTokens matching the sum of included items' tokens", () => {
    const items: ContextItem[] = [
      { id: "a", priority: 1, tokens: 7, text: "" },
      { id: "b", priority: 2, tokens: 13, text: "" },
    ];
    const result = selectContext(items, 100);
    expect(result.totalTokens).toBe(20);
  });

  it("falls back to estimateTokens when tokens isn't precomputed", () => {
    const items: ContextItem[] = [{ id: "a", priority: 1, text: "hello world", kind: "english" }];
    const result = selectContext(items, 1000);
    expect(result.included[0]?.id).toBe("a");
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it("cuts everything when budget is 0, without throwing", () => {
    const items: ContextItem[] = [{ id: "a", priority: 1, tokens: 1, text: "" }];
    const result = selectContext(items, 0);
    expect(result.included).toEqual([]);
    expect(result.cut).toHaveLength(1);
  });

  it("handles an empty item list", () => {
    const result = selectContext([], 1000);
    expect(result).toEqual({ included: [], cut: [], totalTokens: 0, budget: 1000 });
  });
});

describe("selectContext — property: never exceeds contextBudget (P3-T8 / P11-T9 done criterion)", () => {
  // Small deterministic PRNG so failures are reproducible without adding a
  // property-testing dependency for this one check.
  function makeRng(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  const KINDS: TokenKind[] = ["code", "json", "hebrew", "english", "mixed"];

  /**
   * Wider than P3-T8's original generator: budgets range well negative to
   * well positive (not just [0,200)), item counts can be 0, some items omit
   * `tokens` entirely so `estimateTokens`'s fallback path (P11-T9's own
   * randomized text, mixed scripts included) is exercised inside the same
   * property loop instead of only in the hand-written unit tests above, and
   * ids can collide (a real caller could hand two chunks the same id).
   */
  function randomItem(rng: () => number, index: number): ContextItem {
    const useFallback = rng() < 0.3;
    const priority = (Math.floor(rng() * 5) + 1) as ContextPriority;
    const id = `item${String(Math.floor(rng() * (index + 1)))}`; // occasional duplicate ids
    if (useFallback) {
      const kind = KINDS[Math.floor(rng() * KINDS.length)] ?? "mixed";
      const length = Math.floor(rng() * 200);
      const text = Array.from({ length }, () => String.fromCharCode(33 + Math.floor(rng() * 94))).join("");
      return { id, priority, text, kind };
    }
    return { id, priority, tokens: Math.floor(rng() * 500), text: "" };
  }

  function actualTokensOf(item: ContextItem): number {
    return item.tokens ?? estimateTokens(item.text, item.kind ?? "mixed");
  }

  it("totalTokens never exceeds budget, across 10,000 random inputs (P11-T9)", () => {
    const rng = makeRng(1337);
    for (let trial = 0; trial < 10_000; trial++) {
      const itemCount = Math.floor(rng() * 30);
      // Wide range including deep negative and comfortably large, not just [0,200).
      const budget = Math.floor(rng() * 1000) - 300;
      const items: ContextItem[] = Array.from({ length: itemCount }, (_, i) => randomItem(rng, i));

      const result = selectContext(items, budget);

      // 0 included items (totalTokens 0) is always the safe outcome, even
      // under a negative budget — nothing was actually spent, so the bound
      // to check against is max(budget, 0), the same clamp the pre-existing
      // "budget is negative" unit test above already uses.
      expect(result.totalTokens).toBeLessThanOrEqual(Math.max(budget, 0));
      expect(result.totalTokens).toBeGreaterThanOrEqual(0);
      expect(result.totalTokens).toBe(result.included.reduce((sum, i) => sum + actualTokensOf(i), 0));
      expect(result.included.length + result.cut.length).toBe(items.length);
      for (const c of result.cut) {
        expect(c.reason).toBe("over-budget");
      }
      // Every included item's own tokens fit on their own — the running sum
      // check above already implies this, but this pins the item-level
      // half of the property down explicitly.
      for (const included of result.included) {
        expect(actualTokensOf(included)).toBeLessThanOrEqual(Math.max(budget, 0));
      }
    }
  });

  it("also holds when budget is negative or items have zero tokens", () => {
    const rng = makeRng(99);
    for (let trial = 0; trial < 200; trial++) {
      const budget = Math.floor(rng() * 40) - 20; // can be negative
      const items: ContextItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: `item${String(i)}`,
        priority: 1,
        tokens: 0,
        text: "",
      }));
      const result = selectContext(items, budget);
      expect(result.totalTokens).toBeLessThanOrEqual(Math.max(budget, 0));
    }
  });
});
