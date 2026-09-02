import type { BudgetLevel, ReadRung } from "@ao/shared";

/**
 * BUDGET.md §1's per-goal-button-level ceilings. `custom` deliberately has
 * no built-in maxParallel — "המשתמש קובע הכל" (the user decides
 * everything) — so a caller must supply its own cap via
 * `PlanValidationContext.globalMaxParallel` for that level, or V6 skips the
 * parallelism ceiling check entirely.
 */
export const BUDGET_LEVEL_MAX_PARALLEL: Readonly<Record<BudgetLevel, number | undefined>> = {
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
