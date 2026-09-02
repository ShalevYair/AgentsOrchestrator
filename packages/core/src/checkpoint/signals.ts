/**
 * P6-T1 — the six local trigger signals from PROTOCOLS.md §6's table.
 * Every function here is pure and synchronous: no `Ledger`, no
 * `LLMProvider`, no I/O. That's what makes "אין אות → אפס טוקנים" (no
 * signal → zero tokens) a structural guarantee rather than a convention —
 * `computeCheckpointSignals` cannot itself spend anything, so a caller that
 * only invokes the `checkpoint` agent (P6-T2) when `anySignalFired` returns
 * true (or a mandatory point, P6-T5) never reaches a provider on a quiet
 * stage. `gate.ts` wires that call decision together; this file only
 * computes the six booleans themselves.
 */

import type { Stage } from "@ao/shared";

/** PROTOCOLS.md §6's table, in the same row order. */
export interface CheckpointSignals {
  criteriaMissed: boolean;
  budgetDrift: boolean;
  emptyOutput: boolean;
  contradiction: boolean;
  needsPending: boolean;
  schemaViolations: boolean;
}

/** BUDGET.md §4.1's admission already treats "actual vs. estimate" as the unit of drift; PROTOCOLS.md §6 fixes the threshold at 25% over. */
export const BUDGET_DRIFT_RATIO_THRESHOLD = 0.25;

/** PROTOCOLS.md §6: "Task החזיר פחות מסף מינימלי של מעטפות" — the docs never name a number above zero, so the minimal threshold is "produced nothing at all." A task that returns 0 schema-valid NDJSON envelopes has produced no usable output regardless of what it was asked to do. */
export const MIN_ENVELOPES_PER_TASK = 1;

/**
 * Everything `computeCheckpointSignals` needs, already reduced to plain
 * data by the caller — this module has no dependency on the Scheduler's
 * generic `TaskOutcome<T>`/`StageRunResult<T>` (T is whatever the caller's
 * agent-runner integration returns, unknown to `packages/core`'s
 * checkpoint module) or on `@ao/ingest`'s NDJSON parser. The caller
 * projects both down to the flat shape below — the same pattern
 * `applyStageFailurePolicy` (P5-T11) already uses for consuming a
 * `StageRunResult<T>` without knowing `T`.
 */
export interface StageCheckpointSignalInput {
  /** The stage this checkpoint follows. Only `successCriteria` is read. */
  stage: Pick<Stage, "id" | "successCriteria">;
  /**
   * One entry per successfully-completed task in this stage, each holding
   * that task's own reported `criteriaMet` (a `DoneEnvelope.selfCheck`'s
   * field, PROTOCOLS.md §3). `criteriaMissed` fires when the *union*
   * across every task still doesn't cover every one of
   * `stage.successCriteria` — a criterion satisfied by any one task counts
   * for the whole stage, since Tasks routinely split a stage's work.
   */
  reportedCriteriaMet: readonly (readonly string[])[];
  /** BUDGET.md §4.1's precomputed worst-case estimate for this stage (sum of its tasks' `worstCase`, or the stage's own `tokenBudget.estimatedIn + estimatedOut`). */
  estimatedTokens: number;
  /** The Ledger's real `spent` (+ `committed`, if still in flight) for this stage once it's done. */
  actualTokens: number;
  /** Per-task count of schema-valid NDJSON envelopes (`parseNdjson(...).envelopes.length`) — one entry per task that actually ran (a budget-rejected or cancelled task contributes no entry; it never produced output to judge). */
  envelopeCounts: readonly number[];
  /** True only when this stage ran in `ensemble`/`debate` mode and its members' claims genuinely disagree (e.g. the `local:vote` reducer flagged a disputed claim as a `Gap`, PROTOCOLS.md §8) — always `false` for `shard`/`pipeline`/`single` stages, which have nothing to contradict. */
  ensembleContradiction: boolean;
  /** Count of Blackboard `openQuestions` (raised via a `need` NDJSON envelope) still unresolved (`resolvedBy === null`) at the time of this checkpoint. */
  unresolvedNeedsCount: number;
  /** True if *any* task's `parseNdjson(...).violationRatioExceeded` was true (PROTOCOLS.md §3, rule 6: `schemaViolations / totalLines > 0.15`). */
  anyTaskViolationRatioExceeded: boolean;
}

function computeCriteriaMissed(input: StageCheckpointSignalInput): boolean {
  if (input.stage.successCriteria.length === 0) return false;
  const met = new Set<string>();
  for (const perTask of input.reportedCriteriaMet) {
    for (const criterion of perTask) met.add(criterion);
  }
  return input.stage.successCriteria.some((criterion) => !met.has(criterion));
}

function computeBudgetDrift(input: StageCheckpointSignalInput): boolean {
  if (input.estimatedTokens <= 0) return input.actualTokens > 0;
  return input.actualTokens > input.estimatedTokens * (1 + BUDGET_DRIFT_RATIO_THRESHOLD);
}

function computeEmptyOutput(input: StageCheckpointSignalInput): boolean {
  return input.envelopeCounts.some((count) => count < MIN_ENVELOPES_PER_TASK);
}

/**
 * P6-T1 — turns one stage's already-gathered outcome data into the six
 * PROTOCOLS.md §6 booleans. Never throws, never awaits anything: a
 * malformed/empty `input` (e.g. no tasks at all) just yields whichever
 * signals are structurally true of "nothing happened" (`emptyOutput` stays
 * `false` for an empty `envelopeCounts` — nothing to be empty *about* — but
 * `criteriaMissed` still fires if `stage.successCriteria` is non-empty and
 * nothing satisfied it).
 */
export function computeCheckpointSignals(input: StageCheckpointSignalInput): CheckpointSignals {
  return {
    criteriaMissed: computeCriteriaMissed(input),
    budgetDrift: computeBudgetDrift(input),
    emptyOutput: computeEmptyOutput(input),
    contradiction: input.ensembleContradiction,
    needsPending: input.unresolvedNeedsCount > 0,
    schemaViolations: input.anyTaskViolationRatioExceeded,
  };
}

export function anySignalFired(signals: CheckpointSignals): boolean {
  return (
    signals.criteriaMissed ||
    signals.budgetDrift ||
    signals.emptyOutput ||
    signals.contradiction ||
    signals.needsPending ||
    signals.schemaViolations
  );
}

export const NO_SIGNALS: CheckpointSignals = {
  criteriaMissed: false,
  budgetDrift: false,
  emptyOutput: false,
  contradiction: false,
  needsPending: false,
  schemaViolations: false,
};
