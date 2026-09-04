import type { OverrunPolicy, Plan } from "@ao/shared";
import { sumPlanEstimatedTokens } from "./plan-edit.js";
import type { RunState } from "./run-state.js";

export type BudgetSeverity = "ok" | "warning" | "danger";

/** Everything `BudgetMeter`/`Header` need — computed in `ChatView` (where `goalConfig` and `runState` both live) and passed up, same shape as the old `onTokensChange: (tokens: number) => void` it replaces. */
export interface BudgetMeterInfo {
  spent: number;
  committed: number;
  remaining: number;
  total: number;
  byStage: Record<string, number>;
  projection: number | null;
  overrunPolicy: OverrunPolicy;
}

/** BUDGET.md §8: over 75% -> orange ("warning"), over 90% -> red ("danger"). Measured against `spent + committed` (tokens already unavailable to the rest of the run), not `spent` alone — matches `admit()`'s own "available = total - spent - committed" accounting, so the color agrees with what admission control actually sees. */
export function budgetSeverity(spent: number, committed: number, total: number): BudgetSeverity {
  if (total <= 0) return "ok";
  const ratio = (spent + committed) / total;
  if (ratio >= 0.9) return "danger";
  if (ratio >= 0.75) return "warning";
  return "ok";
}

/**
 * BUDGET.md §8's "צפי סיום מבוסס קצב" (rate-based completion projection).
 * "Rate" here is the calibration ratio actual/estimated observed so far
 * (P4's `CalibrationStore` idea, applied client-side to wire data) rather
 * than a wall-clock rate — token spend tracks plan structure (fan-out,
 * stage size) far more tightly than elapsed time, so extrapolating from
 * the plan's own estimates is less noisy than extrapolating from a clock.
 *
 * Returns `null` whenever there isn't a real signal to calibrate from —
 * no plan loaded (today's real chat path never emits `plan.ready`; only a
 * real multi-stage run does), or no stage has finished yet. Never
 * fabricates a number from zero data points.
 */
export function projectFinalTokens(
  plan: Plan | null,
  stages: RunState["stages"],
  spent: number,
): number | null {
  if (!plan) return null;
  const finishedIds = new Set(
    Object.values(stages)
      .filter((s) => s.status === "done" || s.status === "issue" || s.status === "skipped")
      .map((s) => s.stageId),
  );
  if (finishedIds.size === 0) return null;
  const estimatedSoFar = plan.stages
    .filter((s) => finishedIds.has(s.id))
    .reduce((sum, s) => sum + s.tokenBudget.estimatedIn + s.tokenBudget.estimatedOut, 0);
  if (estimatedSoFar === 0) return null;
  const calibrationRatio = spent / estimatedSoFar;
  return Math.round(calibrationRatio * sumPlanEstimatedTokens(plan));
}
