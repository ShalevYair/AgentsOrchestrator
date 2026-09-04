import { MODEL_REGISTRY, WORKER_MODEL_ID, resolveModelEntry } from "@ao/providers/models";
import {
  BUDGET_LEVEL_BLOCKS_ENSEMBLE,
  BUDGET_LEVEL_MAX_PARALLEL,
  BUDGET_LEVEL_MAX_RUNG,
  BUDGET_LEVEL_TOKENS,
} from "@ao/core/plan";
import type { BudgetLevel } from "@ao/shared";

export {
  BUDGET_LEVEL_TOKENS,
  BUDGET_LEVEL_MAX_PARALLEL,
  BUDGET_LEVEL_MAX_RUNG,
  BUDGET_LEVEL_BLOCKS_ENSEMBLE,
};

/**
 * BUDGET.md §1 footnote 1: "אומדן בלבד, לפי תמהיל טיפוסי של 80% קלט / 20%
 * פלט ומחירי ההשקה של gemini-3.7-flash". This is the exact mix that
 * produces the doc's own worked examples (500K → ~$0.7, 2.5M → ~$3.4,
 * 5M → ~$6.8) — verified in cost.test.ts against those three numbers.
 */
const TYPICAL_INPUT_SHARE = 0.8;
const TYPICAL_OUTPUT_SHARE = 0.2;

/**
 * Live $ estimate for a token budget, read straight from
 * `packages/providers/src/models.ts` — the one pricing table (P1-T7) —
 * instead of a copy pasted into the UI. Returns `null` only if the model
 * id isn't in the registry at all (never happens for `WORKER_MODEL_ID`
 * itself; guards a hypothetical future caller passing an arbitrary id).
 */
export function estimateCostUsd(totalTokens: number, modelId: string = WORKER_MODEL_ID): number | null {
  const entry = resolveModelEntry(modelId);
  if (!entry) return null;
  const inputTokens = totalTokens * TYPICAL_INPUT_SHARE;
  const outputTokens = totalTokens * TYPICAL_OUTPUT_SHARE;
  return (
    (inputTokens / 1_000_000) * entry.pricing.inputPerMillionUsd +
    (outputTokens / 1_000_000) * entry.pricing.outputPerMillionUsd
  );
}

export function formatUsd(amount: number): string {
  if (amount < 10) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(1)}`;
}

/** Compact "500K" / "2.5M" style label used throughout UX.md §3's mockup. */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const thousands = tokens / 1_000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return String(tokens);
}

/** Fixed levels only — "custom" has no built-in token count (BUDGET_LEVEL_TOKENS.custom is undefined). */
export const FIXED_BUDGET_LEVELS: readonly Exclude<BudgetLevel, "custom">[] = ["draft", "standard", "deep"];

/** Client-measured elapsed time (P9-T4's task rows: "time" — see run-state.ts's TaskState doc comment on why this is wall-clock-from-the-browser, not server-authoritative) as "12s" / "1m 05s". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${String(seconds)}s`;
  return `${String(minutes)}m ${String(seconds).padStart(2, "0")}s`;
}

export { WORKER_MODEL_ID, MODEL_REGISTRY };
