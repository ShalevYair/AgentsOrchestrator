/**
 * Global concurrency limiter (P1-T5). A plain counting semaphore: `run()`
 * queues the given function until fewer than `max` calls are in flight,
 * runs it, and always releases the slot (success or throw) so a failing
 * call can never leak a permanently-held slot. This is provider-generic —
 * `GeminiProvider` shares one instance across every in-flight `generate`/
 * `countTokens`/`cacheCreate` call to enforce one global cap, but nothing
 * here is Gemini-specific.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly max: number) {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error("ConcurrencyLimiter: max must be a positive integer");
    }
  }

  /** Number of calls currently running (not queued). Exposed for tests and observability. */
  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}
