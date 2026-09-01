import { describe, expect, it } from "vitest";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ConcurrencyLimiter", () => {
  it("never runs more than `max` functions concurrently (property under real async interleaving)", async () => {
    const limiter = new ConcurrencyLimiter(3);
    let current = 0;
    let observedMax = 0;
    const tasks = Array.from({ length: 20 }, (_, i) =>
      limiter.run(async () => {
        current += 1;
        observedMax = Math.max(observedMax, current);
        // Deliberately variable delay so tasks actually interleave rather than running in lockstep.
        await delay((i % 5) + 1);
        current -= 1;
        return i;
      }),
    );
    const results = await Promise.all(tasks);
    expect(observedMax).toBeLessThanOrEqual(3);
    expect(observedMax).toBeGreaterThan(1); // sanity: concurrency actually happened, this isn't accidentally serial
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("releases the slot even when the function throws, so a failure never leaks capacity", async () => {
    const limiter = new ConcurrencyLimiter(1);
    await expect(limiter.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(limiter.activeCount).toBe(0);
    // A second call must be able to acquire the slot immediately — it wouldn't if the first leaked it.
    const result = await limiter.run(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("queues callers beyond the limit and runs them in submission order once slots free up", async () => {
    const limiter = new ConcurrencyLimiter(1);
    const order: number[] = [];
    const releasers: (() => void)[] = [];
    const started: Promise<void>[] = [];

    for (let i = 0; i < 3; i++) {
      started.push(
        limiter.run(
          () =>
            new Promise<void>((resolve) => {
              order.push(i);
              releasers.push(resolve);
            }),
        ),
      );
    }

    // Only the first task should have started; the other two are queued.
    await delay(5);
    expect(order).toEqual([0]);
    releasers[0]?.();
    await delay(5);
    expect(order).toEqual([0, 1]);
    releasers[1]?.();
    await delay(5);
    expect(order).toEqual([0, 1, 2]);
    releasers[2]?.();
    await Promise.all(started);
  });

  it("rejects a non-positive or non-integer max", () => {
    expect(() => new ConcurrencyLimiter(0)).toThrow();
    expect(() => new ConcurrencyLimiter(-1)).toThrow();
    expect(() => new ConcurrencyLimiter(1.5)).toThrow();
  });
});
