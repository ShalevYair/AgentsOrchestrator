export interface RetryClassification {
  retryable: boolean;
  /** Honor a server-provided `Retry-After` (or gRPC `RetryInfo.retryDelay`) when the caller can extract one. */
  retryAfterMs?: number;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  classify: (error: unknown) => RetryClassification;
  /** Injectable for tests — real code never overrides this. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for deterministic jitter in tests — real code never overrides this. */
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 30_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Exponential backoff with full jitter (P1-T5): attempt N waits a random
 * fraction of `min(maxDelayMs, baseDelayMs * 2^(N-1))` — half to full, so
 * consecutive attempts overlap in range rather than jumping in fixed
 * powers-of-two steps, which is what actually spreads out retries under
 * concurrent load. When `classify` returns a `retryAfterMs` (the server's
 * own `Retry-After` / `RetryInfo.retryDelay`), that value wins outright —
 * honoring the server's stated cooldown takes priority over our own
 * backoff schedule.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      const classification = options.classify(error);
      if (!classification.retryable || attempt >= maxAttempts) {
        throw error;
      }
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jittered = exponential * (0.5 + random() * 0.5);
      const delayMs = Math.min(maxDelayMs, classification.retryAfterMs ?? jittered);
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}

/**
 * Best-effort extraction of a server-stated retry delay from a Gemini
 * `ApiError`'s message. Google's API errors are gRPC-derived and often
 * embed a `google.rpc.RetryInfo` with a `retryDelay` field (e.g.
 * `"retryDelay":"19s"`) inside the JSON error body that
 * `@google/genai`'s `ApiError` folds into its `message` string — the SDK's
 * public `ApiError` type (verified against the installed 2.20.0 `.d.ts`)
 * exposes only `status` and `message`, not response headers, so this
 * string scan is the only way to recover it without reaching into SDK
 * internals. Returns undefined (falling back to our own exponential
 * backoff) when no such field is present — this is deliberately
 * best-effort, not a guarantee every 429 carries one.
 */
const RETRY_DELAY_PATTERN = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/;

export function extractRetryDelayMs(message: string): number | undefined {
  const match = RETRY_DELAY_PATTERN.exec(message);
  if (!match?.[1]) return undefined;
  const seconds = Number.parseFloat(match[1]);
  if (!Number.isFinite(seconds)) return undefined;
  return Math.round(seconds * 1000);
}
