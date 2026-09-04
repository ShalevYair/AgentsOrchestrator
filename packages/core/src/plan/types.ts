import type { BudgetLevel, GoalConfig, ReadRung } from "@ao/shared";

/**
 * Shape shared by `BUDGET_LEVEL_TOKENS`/`BUDGET_LEVEL_MAX_PARALLEL`: a
 * value for each fixed level, and always `undefined` for "custom" (the
 * user decides everything there). More precise than
 * `Record<BudgetLevel, T | undefined>` would be: indexing with a literal
 * key like `.standard` narrows to `T`, not `T | undefined`, while indexing
 * dynamically with a `BudgetLevel`-typed variable (as validate.ts does)
 * still widens to `T | undefined` exactly as before — no behavior change
 * for existing callers.
 */
type PerFixedBudgetLevel<T> = Readonly<{ draft: T; standard: T; deep: T; custom: undefined }>;

/**
 * BUDGET.md §1's token budget for each fixed goal-button level. `custom`
 * has no fixed value — the user types their own (UX.md §3's "⚙️ מותאם"
 * free-input field) — so it's `undefined` here rather than a placeholder
 * number a caller might use by mistake.
 */
export const BUDGET_LEVEL_TOKENS: PerFixedBudgetLevel<number> = {
  draft: 500_000,
  standard: 2_500_000,
  deep: 5_000_000,
  custom: undefined,
};

/**
 * BUDGET.md §1's per-goal-button-level ceilings. `custom` deliberately has
 * no built-in maxParallel — "המשתמש קובע הכל" (the user decides
 * everything) — so a caller must supply its own cap via
 * `PlanValidationContext.globalMaxParallel` for that level, or V6 skips the
 * parallelism ceiling check entirely.
 */
export const BUDGET_LEVEL_MAX_PARALLEL: PerFixedBudgetLevel<number> = {
  draft: 3,
  standard: 6,
  deep: 12,
  custom: undefined,
};

/** BUDGET.md §1's per-level read-rung ceiling (ARCHITECTURE.md §5.2). */
export const BUDGET_LEVEL_MAX_RUNG: Readonly<Record<BudgetLevel, ReadRung>> = {
  draft: "R4",
  standard: "R5",
  deep: "R5",
  custom: "R5",
};

/** BUDGET.md §1: "ensemble/debate חסומים" at the draft level only. */
export const BUDGET_LEVEL_BLOCKS_ENSEMBLE: Readonly<Record<BudgetLevel, boolean>> = {
  draft: true,
  standard: false,
  deep: false,
  custom: false,
};

/**
 * The goal button's out-of-the-box state (UX.md §3's mockup: "⚖️ סטנדרט"
 * pre-selected, "מאוזן" effort, "הורד דרגה אוטומטית" overrun policy,
 * scripts on / folder-write off / pre-approval off per Q3/Q6 in
 * DECISIONS.md). Built from `BUDGET_LEVEL_TOKENS`/`BUDGET_LEVEL_MAX_PARALLEL`
 * rather than repeating their numbers, so the two can never drift apart.
 */
export const DEFAULT_GOAL_CONFIG: GoalConfig = {
  level: "standard",
  budgetTotal: BUDGET_LEVEL_TOKENS.standard,
  effort: "medium",
  overrunPolicy: "degrade",
  maxParallel: BUDGET_LEVEL_MAX_PARALLEL.standard,
  allowScripts: true,
  allowFolderWrite: false,
  requirePlanApproval: false,
};

const READ_RUNG_ORDER: readonly ReadRung[] = ["R0", "R1", "R2", "R3", "R4", "R5"];

export function rungIndex(rung: ReadRung): number {
  return READ_RUNG_ORDER.indexOf(rung);
}

/**
 * V7's stage->deliverable-kind linkage. `Stage` carries no explicit
 * `producesDeliverable` field (PROTOCOLS.md §1's schema doesn't define
 * one), so this maps ARCHITECTURE.md §4's agent-role table onto
 * `Deliverable.kind` directly: `writer`/`synthesizer` are the only roles
 * whose job is prose (-> `markdown`), `coder` is the only role that owns
 * file writes (-> `files`). `data` is intentionally permissive — nearly
 * every worker role can emit structured `finding`/`tool_result` envelopes,
 * so it's satisfied by any stage whose role isn't purely orchestration
 * (`recon`/`planner`/`checkpoint`/`outliner`/`critic` never themselves
 * constitute a deliverable). Both this validator and the planner (P5-T3)
 * built later in this same phase follow this table, so it can't drift.
 */
export const DELIVERABLE_KIND_AGENT_TYPES: Readonly<Record<string, readonly string[]>> = {
  markdown: ["writer", "synthesizer"],
  files: ["coder"],
  data: ["reader", "analyst", "toolsmith", "coder", "writer", "synthesizer"],
};
