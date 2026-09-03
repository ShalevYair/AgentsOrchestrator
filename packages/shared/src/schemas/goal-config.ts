import { z } from "zod";
import { BudgetLevelSchema, ThinkingLevelSchema } from "./common.js";

/** BUDGET.md §1 "בחריגה מהתקציב" — what happens when a call would exceed the ledger's available budget. */
export const OverrunPolicySchema = z.enum(["degrade", "ask", "hard-stop"]);
export type OverrunPolicy = z.infer<typeof OverrunPolicySchema>;

/**
 * UX.md §3's "כפתור מטרה" (goal button) settings — everything the user sets
 * once per conversation to govern how a run is allowed to spend. Persisted
 * per-thread (`apps/runtime`'s `threads` table), not per-message: BUDGET.md
 * §1 is explicit that the token *budget* itself is per-turn ("לכל שליחת
 * פקודה"), but the goal-button *configuration* — the choice of level,
 * effort, etc. — is what "נשמר לשיחה" (saved to the conversation) refers
 * to, so the user doesn't have to re-pick it on every message.
 */
export const GoalConfigSchema = z.strictObject({
  level: BudgetLevelSchema,
  /** Total token budget for the *next* turn. For level !== "custom" this always equals BUDGET_LEVEL_TOKENS[level] (packages/core/plan/types.ts) — kept as an explicit field rather than derived so "custom" has somewhere to store the user's number. */
  budgetTotal: z.number().int().positive(),
  effort: ThinkingLevelSchema,
  overrunPolicy: OverrunPolicySchema,
  maxParallel: z.number().int().positive(),
  allowScripts: z.boolean(),
  allowFolderWrite: z.boolean(),
  requirePlanApproval: z.boolean(),
});
export type GoalConfig = z.infer<typeof GoalConfigSchema>;
