/**
 * A minimal bounded-concurrency worker pool. Deliberately local to
 * `packages/core` rather than reusing `@ao/providers`'s
 * `ConcurrencyLimiter` (P1-T5) — `core` cannot depend on `@ao/providers` in
 * production code (P1-T1/P4-T1's layering rule), only as a test-only
 * devDependency (P5-T8's `MockLLMProvider` usage).
 *
 * Correctness of the concurrency bound (P5-T4's own property-test
 * requirement: "never exceeds maxParallel") comes from `nextIndex` being
 * claimed synchronously — JS has no preemption, so `nextIndex += 1`
 * always completes before the next `await` yields control, meaning no two
 * worker loops can ever claim the same index or run more than
 * `effectiveLimit` invocations of `worker` concurrently.
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  let nextIndex = 0;
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));

  async function workerLoop(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      if (index >= items.length) return;
      nextIndex = index + 1;
      results[index] = await worker(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => workerLoop()));
  return results;
}
