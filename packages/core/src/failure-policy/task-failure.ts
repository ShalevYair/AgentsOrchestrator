/** ARCHITECTURE.md §10's call-level ladder ("קריאה"): retry with jitter on 429/5xx, then a hardened-schema retry on invalid output, then a different model. That ladder is entirely `LLMProvider`-side retry/backoff (`@ao/providers`'s `withRetry`, P1-T5) — `packages/core` never talks to a provider directly, so there is nothing for this package to add at that level. */

export type TaskFailureAction = "retry-with-reduced-context" | "reallocate" | "skip";

/**
 * ARCHITECTURE.md §10's Task-level ladder: "ניסיון חוזר עם הקשר מצומצם →
 * הקצאה מחדש → דילוג עם רישום פער". This is a pure decision function —
 * `attemptsSoFar` counts how many times this exact Task has already failed
 * (0 on the very first failure). Actually retrying with less context,
 * reassigning the work, or recording the skip is the Scheduler/agent-runner
 * caller's job; this only says which of the three comes next.
 */
export function nextTaskFailureAction(attemptsSoFar: number): TaskFailureAction {
  if (attemptsSoFar <= 0) return "retry-with-reduced-context";
  if (attemptsSoFar === 1) return "reallocate";
  return "skip";
}
