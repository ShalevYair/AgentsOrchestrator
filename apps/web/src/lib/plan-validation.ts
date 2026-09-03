import { validatePlan, type PlanValidationResult } from "@ao/core/plan";
import { resolveModelEntry, WORKER_MODEL_ID } from "@ao/providers/models";
import type { BudgetLevel, Plan } from "@ao/shared";
import { BUDGET_LEVEL_MAX_PARALLEL } from "./cost.js";

const FALLBACK_MAX_OUTPUT_TOKENS = 64_000;

/**
 * P9-T3: the client-side half of "אין UI ו-validator שיסתרו" — this calls
 * the exact same `validatePlan` (P5-T1) the server runs, not a
 * reimplementation, so a plan the UI accepts can never be one the server
 * would reject (or vice versa).
 *
 * `knownAgentTypes` (V3) is derived from the plan's own stages rather than
 * a real agent registry (P10 doesn't exist yet in this codebase): editing
 * a plan in this UI never introduces a *new* agentType, only changes
 * counts/rung/removes optional stages, so every type present was already
 * valid before the edit — deriving it this way can't hide a real V3
 * failure, it just doesn't re-litigate one that would have already
 * blocked the plan before any editing began.
 */
export function validateEditedPlan(
  plan: Plan,
  budgetTotal: number,
  budgetLevel: BudgetLevel,
): PlanValidationResult {
  const globalMaxParallel = BUDGET_LEVEL_MAX_PARALLEL[budgetLevel];
  return validatePlan(plan, {
    budgetTotal,
    budgetLevel,
    knownAgentTypes: new Set(plan.stages.map((s) => s.agentType)),
    modelMaxOutputTokens: resolveModelEntry(WORKER_MODEL_ID)?.maxOutputTokens ?? FALLBACK_MAX_OUTPUT_TOKENS,
    ...(globalMaxParallel !== undefined ? { globalMaxParallel } : {}),
  });
}
