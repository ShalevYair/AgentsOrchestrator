/**
 * Token-bucket rate limiter (P1-T5). Independent of `ConcurrencyLimiter`:
 * concurrency bounds how many calls are in flight at once, this bounds how
 * many calls can *start* per unit time — both are needed since a provider
 * can reject a burst of instantly-parallel calls even when each one
 * finishes quickly.
 */
export interface RateLimiterOptions {
  /** Bucket capacity — the largest burst allowed. */
  maxTokens: number;
  /** Steady-state rate the bucket refills at. */
  refillPerSecond: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export class RateLimiter {
  private tokens: number;
  private lastRefillMs: number;
  private readonly maxTokens: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions) {
    if (options.maxTokens <= 0 || options.refillPerSecond <= 0) {
      throw new Error("RateLimiter: maxTokens and refillPerSecond must be positive");
    }
    this.maxTokens = options.maxTokens;
    this.refillPerSecond = options.refillPerSecond;
    this.now = options.now ?? Date.now;
    this.tokens = options.maxTokens;
    this.lastRefillMs = this.now();
  }

  private refill(): void {
    const now = this.now();
    const elapsedSeconds = Math.max(0, (now - this.lastRefillMs) / 1000);
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsedSeconds * this.refillPerSecond);
      this.lastRefillMs = now;
    }
  }

  /** Non-blocking: returns whether `cost` tokens were available and consumed. */
  tryAcquire(cost = 1): boolean {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  /** Current token count, after applying refill — for observability/tests. */
  availableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /** Blocks (via `sleep`) until `cost` tokens are available, then consumes them. */
  async acquire(cost = 1, sleep: (ms: number) => Promise<void> = defaultSleep): Promise<void> {
    for (;;) {
      if (this.tryAcquire(cost)) return;
      const deficit = cost - this.tokens;
      const waitMs = Math.max(1, Math.ceil((deficit / this.refillPerSecond) * 1000));
      await sleep(waitMs);
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
