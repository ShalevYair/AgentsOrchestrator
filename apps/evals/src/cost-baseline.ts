import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { EvalCaseRunResult } from "./run-case.js";

/**
 * TASKS.md P11-T5 — "סף שנכשל כשמשימה מתייקרת מעל X%" (a threshold that
 * fails when a task gets more than X% pricier). Deliberately separate
 * from P11-T3's `evals/history.jsonl`/`detectRegressions`: that file
 * grows on every `pnpm eval` run and flags *any* increase against the
 * single most recent run — good for local/dev feedback, but not what a
 * CI gate on an ephemeral checkout wants (T3's own documented gap:
 * history.jsonl growing across CI runs has nowhere durable to land).
 * `evals/cost-baseline.json` is instead a small, deliberately-committed
 * snapshot — updated by a human/PR on purpose when a real cost change is
 * expected, checked with real tolerance (`COST_REGRESSION_THRESHOLD`) so
 * ordinary noise never fails CI.
 */
export const COST_REGRESSION_THRESHOLD_PERCENT = 25;

const CostBaselineEntrySchema = z.strictObject({
  tokensSpent: z.number().int().positive(),
  costUsd: z.number().nonnegative(),
});
const CostBaselineSchema = z.record(z.string(), CostBaselineEntrySchema);
export type CostBaseline = z.infer<typeof CostBaselineSchema>;

export function resolveCostBaselinePath(evalsDir: string): string {
  return join(evalsDir, "cost-baseline.json");
}

/** Missing file is not an error — a case with no baseline entry simply isn't checked (see `checkCostRegressions`), same "nothing to compare against yet" stance as `history.ts`'s `loadHistory`. */
export function loadCostBaseline(path: string): CostBaseline {
  if (!existsSync(path)) return {};
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return CostBaselineSchema.parse(raw);
}

export interface CostRegressionFinding {
  caseId: string;
  reason: string;
}

/**
 * Flags a case only when its real `tokensSpent` exceeds its baseline by
 * more than `thresholdPercent` — not any increase at all (contrast
 * `history.ts`'s `detectRegressions`, which is strict because it compares
 * against literally the last run). A case absent from `baseline` (new,
 * or never added to the baseline snapshot) is skipped, not flagged —
 * there's nothing to regress against yet.
 */
export function checkCostRegressions(
  baseline: CostBaseline,
  results: readonly EvalCaseRunResult[],
  thresholdPercent: number = COST_REGRESSION_THRESHOLD_PERCENT,
): CostRegressionFinding[] {
  const findings: CostRegressionFinding[] = [];
  for (const result of results) {
    const entry = baseline[result.id];
    if (!entry) continue;
    const allowedTokens = entry.tokensSpent * (1 + thresholdPercent / 100);
    if (result.tokensSpent > allowedTokens) {
      const percentOver = ((result.tokensSpent / entry.tokensSpent - 1) * 100).toFixed(1);
      findings.push({
        caseId: result.id,
        reason: `tokensSpent ${String(result.tokensSpent)} is ${percentOver}% above baseline ${String(entry.tokensSpent)} (threshold: ${String(thresholdPercent)}%)`,
      });
    }
  }
  return findings;
}
