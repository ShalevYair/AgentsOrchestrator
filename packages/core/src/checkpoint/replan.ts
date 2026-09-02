/**
 * P6-T6 — `decision: "replan"` builds a brand-new `Plan` while preserving
 * completed work. Two layers:
 *
 * - `buildReplan` (pure, synchronous) — takes a candidate `Plan` (already
 *   produced somehow) plus the set of stage ids that already finished in
 *   the run being replanned, and turns them into a versioned,
 *   diff-carrying `ReplanResult`. It doesn't care *how* the candidate was
 *   produced, and doesn't call anything.
 * - `runReplan` (async) — the concrete "build a new plan" step:
 *   re-invokes `runPlanner` (P5-T3, unchanged) to actually get a candidate
 *   from the model, then hands it to `buildReplan`.
 *
 * Neither function re-runs a completed stage or discards its Blackboard
 * output — `preservedStageIds` is exactly `completedStageIds`, passed
 * straight through regardless of whether the new plan's DAG still
 * declares a stage with that id. Actually *not re-running* those stages is
 * the Scheduler's job (`runScheduler`'s `skipStageIds`, this same phase's
 * extension of P5-T4) — `preservedStageIds` here is the value a caller
 * feeds into that option.
 */

import type { LLMProvider, Plan, TaskUnderstanding } from "@ao/shared";
import { runPlanner, type PlannerAttempt, type RunPlannerParams } from "../planner/index.js";
import type { Ledger } from "../ledger/index.js";
import type { PlanValidationContext } from "../plan/index.js";
import { validatePlan } from "../plan/index.js";
import { diffPlanStages } from "./diff.js";

export interface BuildReplanParams {
  oldPlan: Plan;
  /** A candidate `Plan` already produced (typically by `runPlanner`) — not yet guaranteed to share `oldPlan`'s version numbering, which this function fixes up. */
  newPlanCandidate: Plan;
  /** Stage ids that already finished in the run being replanned (`computeResumePoint`, P5-T12) — never re-run, regardless of whether `newPlanCandidate` still declares a stage with that id. */
  completedStageIds: readonly string[];
  validationContext: PlanValidationContext;
}

export interface ReplanResult {
  plan: Plan;
  version: number;
  diff: string;
  preservedStageIds: readonly string[];
}

/**
 * Renumbers `newPlanCandidate` to continue `oldPlan`'s version sequence
 * and re-validates the result (cheap — no I/O, no LLM call). `runPlanner`
 * already validated its own output once against `validationContext`
 * before returning it, but that validation ran against `newPlanCandidate`'s
 * own self-reported `version`, not the renumbered one this function
 * assigns — re-running `validatePlan` here is what actually proves the
 * *returned* document (with its final version number) is valid, not just
 * the one the model produced a moment earlier.
 */
export function buildReplan(params: BuildReplanParams): ReplanResult {
  const { oldPlan, newPlanCandidate, completedStageIds, validationContext } = params;
  const renumbered: Plan = { ...newPlanCandidate, version: oldPlan.version + 1 };

  const validation = validatePlan(renumbered, validationContext);
  if (!validation.valid || !validation.plan) {
    const summary = validation.issues.map((issue) => `[${issue.code}] ${issue.message}`).join("; ");
    throw new Error(`replan candidate failed re-validation after version renumbering: ${summary}`);
  }

  return {
    plan: validation.plan,
    version: validation.plan.version,
    diff: diffPlanStages(oldPlan, validation.plan),
    preservedStageIds: [...completedStageIds],
  };
}

export interface RunReplanParams {
  ledger: Ledger;
  provider: LLMProvider;
  /** `tier.worker`'s resolved model id — replanning reuses `runPlanner` (P5-T3) as-is, same tier as ordinary planning. */
  model: string;
  stageId: string;
  oldPlan: Plan;
  completedStageIds: readonly string[];
  understanding: TaskUnderstanding;
  inventory: string;
  recipes?: readonly string[];
  validationContext: PlanValidationContext;
  worstCasePerAttempt: number;
  maxRepairAttempts?: number;
}

export interface RunReplanResult extends ReplanResult {
  plannerAttempts: readonly PlannerAttempt[];
}

/**
 * The concrete "replan builds a new plan" step: calls `runPlanner` again
 * (BUDGET.md §3's `planning` bucket already covers "בניית התוכנית + תיקונים"
 * — a replan is exactly that, building a plan, so it reuses the same
 * bucket rather than inventing a separate one) and feeds the result
 * through `buildReplan`. `runPlanner` itself already guarantees it never
 * returns anything that fails `validatePlan` — see its own doc comment —
 * so the only new failure mode `buildReplan` adds is the version-renumbering
 * re-check above.
 */
export async function runReplan(params: RunReplanParams): Promise<RunReplanResult> {
  const plannerRequest: RunPlannerParams = {
    ledger: params.ledger,
    provider: params.provider,
    model: params.model,
    stageId: params.stageId,
    understanding: params.understanding,
    inventory: params.inventory,
    validationContext: params.validationContext,
    worstCasePerAttempt: params.worstCasePerAttempt,
  };
  if (params.recipes !== undefined) plannerRequest.recipes = params.recipes;
  if (params.maxRepairAttempts !== undefined) plannerRequest.maxRepairAttempts = params.maxRepairAttempts;

  const plannerResult = await runPlanner(plannerRequest);

  const replanResult = buildReplan({
    oldPlan: params.oldPlan,
    newPlanCandidate: plannerResult.plan,
    completedStageIds: params.completedStageIds,
    validationContext: params.validationContext,
  });

  return { ...replanResult, plannerAttempts: plannerResult.attempts };
}
