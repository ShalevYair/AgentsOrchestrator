import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  it("allows bursts up to maxTokens, then rejects until refill", () => {
    const now = 0;
    const limiter = new RateLimiter({ maxTokens: 3, refillPerSecond: 1, now: () => now });
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it("refills over time at the configured rate", () => {
    let now = 0;
    const limiter = new RateLimiter({ maxTokens: 2, refillPerSecond: 1, now: () => now });
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    now += 1000; // 1 second passes -> 1 token refilled
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it("never exceeds maxTokens even after a long idle period", () => {
    let now = 0;
    const limiter = new RateLimiter({ maxTokens: 2, refillPerSecond: 5, now: () => now });
    now += 100_000; // huge gap
    expect(limiter.availableTokens()).toBe(2);
  });

  it("acquire() blocks via the injected sleep until tokens are available, then proceeds", async () => {
    let now = 0;
    const limiter = new RateLimiter({ maxTokens: 1, refillPerSecond: 1, now: () => now });
    expect(limiter.tryAcquire()).toBe(true); // drain the single token

    const sleep = vi.fn((ms: number) => {
      now += ms; // simulate time passing while "asleep"
      return Promise.resolve();
    });

    await limiter.acquire(1, sleep);
    expect(sleep).toHaveBeenCalled();
  });

  it("rejects non-positive configuration", () => {
    expect(() => new RateLimiter({ maxTokens: 0, refillPerSecond: 1 })).toThrow();
    expect(() => new RateLimiter({ maxTokens: 1, refillPerSecond: 0 })).toThrow();
  });
});
