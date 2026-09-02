import { describe, expect, it } from "vitest";
import { runPool } from "./pool.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runPool", () => {
  it("returns an empty array for zero items without calling the worker", async () => {
    let calls = 0;
    const result = await runPool([], 3, () => {
      calls += 1;
      return Promise.resolve(1);
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it("preserves result order matching input order regardless of completion order", async () => {
    const items = [30, 10, 20];
    const result = await runPool(items, 3, async (ms) => {
      await delay(ms);
      return ms;
    });
    expect(result).toEqual([30, 10, 20]);
  });

  it("runs every item exactly once", async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const seen: number[] = [];
    await runPool(items, 4, (item) => {
      seen.push(item);
      return Promise.resolve(item);
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it("property: concurrency never exceeds the configured limit, across many random shapes", async () => {
    let seed = 99;
    function nextRandom(): number {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }

    for (let trial = 0; trial < 40; trial++) {
      const itemCount = Math.floor(nextRandom() * 20);
      const limit = Math.max(1, Math.floor(nextRandom() * 6));
      const items = Array.from({ length: itemCount }, () => Math.floor(nextRandom() * 5));

      let active = 0;
      let maxObserved = 0;
      await runPool(items, limit, async (ms) => {
        active += 1;
        maxObserved = Math.max(maxObserved, active);
        await delay(ms);
        active -= 1;
        return ms;
      });

      expect(maxObserved).toBeLessThanOrEqual(Math.min(limit, Math.max(1, itemCount)));
    }
  });
});
