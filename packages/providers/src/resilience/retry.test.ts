import { describe, expect, it, vi } from "vitest";
import { extractRetryDelayMs, withRetry } from "./retry.js";

function retryableError(status: number): Error & { status: number } {
  return Object.assign(new Error(`request failed with status ${status}`), { status });
}

describe("withRetry", () => {
  it("returns the result immediately when the function succeeds on the first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { classify: () => ({ retryable: false }) });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 with exponential-ish backoff timing and eventually succeeds", async () => {
    const sleeps: number[] = [];
    const sleep = vi.fn((ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    });
    let calls = 0;
    const fn = vi.fn(() => {
      calls += 1;
      if (calls < 4) return Promise.reject(retryableError(429));
      return Promise.resolve("ok");
    });

    const result = await withRetry(fn, {
      classify: (err) => ({ retryable: (err as { status: number }).status === 429 }),
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      sleep,
      random: () => 1, // pin jitter to the top of its range for deterministic assertions
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(4);
    // attempt 1 -> wait ~100ms (2^0 * 100, full jitter -> exactly 100 since random()=1 -> factor 1.0)
    // attempt 2 -> wait ~200ms (2^1 * 100)
    // attempt 3 -> wait ~400ms (2^2 * 100)
    expect(sleeps).toEqual([100, 200, 400]);
  });

  it("honors a server-provided Retry-After / retryDelay over its own backoff schedule", async () => {
    const sleeps: number[] = [];
    const sleep = vi.fn((ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    });
    let calls = 0;
    const fn = vi.fn(() => {
      calls += 1;
      if (calls < 2) return Promise.reject(retryableError(429));
      return Promise.resolve("ok");
    });

    await withRetry(fn, {
      classify: () => ({ retryable: true, retryAfterMs: 19_000 }),
      baseDelayMs: 100,
      sleep,
    });

    expect(sleeps).toEqual([19_000]);
  });

  it("caps a retryAfterMs at maxDelayMs so a server can't force an unbounded wait", async () => {
    const sleeps: number[] = [];
    const sleep = vi.fn((ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    });
    let calls = 0;
    const fn = vi.fn(() => {
      calls += 1;
      if (calls < 2) return Promise.reject(retryableError(429));
      return Promise.resolve("ok");
    });

    await withRetry(fn, {
      classify: () => ({ retryable: true, retryAfterMs: 999_000 }),
      maxDelayMs: 30_000,
      sleep,
    });

    expect(sleeps).toEqual([30_000]);
  });

  it("does not retry a non-retryable error (e.g. a 400) — throws immediately", async () => {
    const fn = vi.fn().mockRejectedValue(retryableError(400));
    await expect(
      withRetry(fn, { classify: (err) => ({ retryable: (err as { status: number }).status === 429 }) }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and rethrows the last error", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const fn = vi.fn().mockRejectedValue(retryableError(503));
    await expect(
      withRetry(fn, { classify: () => ({ retryable: true }), maxAttempts: 3, sleep, baseDelayMs: 1 }),
    ).rejects.toThrow(/503/);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("calls onRetry with attempt number and delay before each retry", async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const fn = vi.fn(() => {
      calls += 1;
      if (calls < 2) return Promise.reject(retryableError(500));
      return Promise.resolve("done");
    });
    await withRetry(fn, {
      classify: () => ({ retryable: true }),
      baseDelayMs: 1,
      sleep: () => Promise.resolve(),
      onRetry,
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({ attempt: 1 });
  });
});

describe("extractRetryDelayMs", () => {
  it("parses a RetryInfo.retryDelay embedded in a gRPC-derived error message", () => {
    const message =
      '{"error":{"code":429,"message":"Resource exhausted","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"19s"}]}}';
    expect(extractRetryDelayMs(message)).toBe(19_000);
  });

  it("parses a fractional-second delay", () => {
    expect(extractRetryDelayMs('"retryDelay":"3.5s"')).toBe(3500);
  });

  it("returns undefined when no retryDelay is present", () => {
    expect(extractRetryDelayMs("plain rate limit error with no structured detail")).toBeUndefined();
  });
});
