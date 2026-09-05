import { CalibrationStore, simulatePlan } from "@ao/core";
import type { EvalCase } from "@ao/shared";
import type { EvalCaseRunResult } from "./run-case.js";

const THINKING_LEVEL = "medium" as const;

export interface BudgetAccuracyCaseInput {
  id: string;
  recipeName: string;
  budgetTotal: number;
  /** Real `EvalCase.tags` — used only to separate the "large-input"/"large-output" cohort from the rest in the report below, nothing more. */
  tags: readonly string[];
  result: EvalCaseRunResult;
}

/**
 * `evals/cases/*.yaml`'s own `large-input`/`large-output` tags (P11-T2) mark
 * the cases whose *actual* spend is deliberately inflated (more shard items,
 * longer synthetic evidence — see `run-case.ts`'s `SHARD_ITEM_COUNT_BY_INPUT_SCALE`/
 * `EVIDENCE_REPEAT_BY_INPUT_SCALE`) while the recipe's own static
 * `tokenBudget.estimatedIn`/`estimatedOut` (`recipes/*.yaml`) stays fixed
 * regardless of case — a real, documented (TASKS.md P11-T10) limitation of
 * this eval harness's fixtures, not of `simulatePlan`/`CalibrationStore`
 * themselves: a real production Plan's `tokenBudget` is derived from actual
 * inventory sizing per run, not a constant.
 */
function isLargeScaleCohort(tags: readonly string[]): boolean {
  return tags.includes("large-input") || tags.includes("large-output");
}

export interface BudgetAccuracyEntry {
  caseId: string;
  recipeName: string;
  largeScale: boolean;
  /** Real total tokens actually spent across every stage — `sum(stageActualTokens)`. */
  actualExecutionTotal: number;
  /** `simulatePlan`'s `executionTotal` with no calibration data at all. */
  simulatedBefore: number;
  /** `simulatePlan`'s `executionTotal` with a `CalibrationStore` trained only on the *other* recipes' cases (never this case's own data — a genuine held-out measurement, not train-on-test). */
  simulatedAfter: number;
  deviationBeforePct: number;
  deviationAfterPct: number;
}

export interface BudgetAccuracyReport {
  entries: BudgetAccuracyEntry[];
  averageDeviationBeforePct: number;
  averageDeviationAfterPct: number;
  /** Same average, restricted to entries where `largeScale` is false — the cohort `simulatePlan`'s fixed-key calibration can actually fit, since it isn't asked to blend one ratio across a ~30-100x actual-spend range within the same `(agentType, thinkingLevel)` key (see `isLargeScaleCohort`'s doc comment). */
  averageDeviationAfterPctRegularScale: number;
}

function deviationPct(simulated: number, actual: number): number {
  if (actual <= 0) return 0; // nothing was really spent — no meaningful ratio to report
  return (Math.abs(simulated - actual) / actual) * 100;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * TASKS.md P11-T10 — measures how far `@ao/core`'s `simulatePlan` (P4-T7,
 * the pre-run token estimator) lands from what a golden eval case *actually*
 * spent (per-stage `Ledger` truth, P11-T9's sibling addition to
 * `EvalCaseRunResult`), both before any calibration data exists and after a
 * `CalibrationStore` (P4-T6) has learned from real settled calls.
 *
 * The "after" measurement is genuinely held-out, not trained-on-test: for
 * each case, the `CalibrationStore` used to simulate it is built only from
 * every *other* case's real per-stage samples — one case per recipe would
 * otherwise leak its own actuals into its own "improved" estimate, which
 * would overstate how well calibration generalizes to a run it hasn't seen
 * yet (exactly the scenario BUDGET.md §4.3 describes: "from the second run
 * onward"). Every recipe's stage agentTypes are fixed by the recipe itself
 * (only `inputScale`/`estimatedSize` vary between its cases), so any other
 * case of the *same* recipe already supplies calibration samples for every
 * agentType this case's Plan uses.
 */
export function computeBudgetAccuracy(inputs: readonly BudgetAccuracyCaseInput[]): BudgetAccuracyReport {
  const withPlans = inputs.filter(
    (
      input,
    ): input is BudgetAccuracyCaseInput & { result: { plan: NonNullable<EvalCaseRunResult["plan"]> } } =>
      input.result.plan !== undefined,
  );

  const entries: BudgetAccuracyEntry[] = withPlans.map((input) => {
    const { plan } = input.result;
    const actualExecutionTotal = Object.values(input.result.stageActualTokens).reduce((a, b) => a + b, 0);

    const before = simulatePlan(plan, input.budgetTotal).executionTotal;

    const heldOutCalibration = new CalibrationStore();
    for (const other of withPlans) {
      if (other.id === input.id) continue; // held out — never trains its own estimate
      for (const stage of other.result.plan.stages) {
        const rawEstimate = stage.tokenBudget.estimatedIn + stage.tokenBudget.estimatedOut;
        const actual = other.result.stageActualTokens[stage.id];
        if (actual === undefined) continue;
        heldOutCalibration.record(
          { agentType: stage.agentType, thinkingLevel: THINKING_LEVEL },
          rawEstimate,
          actual,
        );
      }
    }
    const after = simulatePlan(plan, input.budgetTotal, {
      calibration: heldOutCalibration,
      resolveThinkingLevel: () => THINKING_LEVEL,
    }).executionTotal;

    return {
      caseId: input.id,
      recipeName: input.recipeName,
      largeScale: isLargeScaleCohort(input.tags),
      actualExecutionTotal,
      simulatedBefore: before,
      simulatedAfter: after,
      deviationBeforePct: deviationPct(before, actualExecutionTotal),
      deviationAfterPct: deviationPct(after, actualExecutionTotal),
    };
  });

  return {
    entries,
    averageDeviationBeforePct: average(entries.map((e) => e.deviationBeforePct)),
    averageDeviationAfterPct: average(entries.map((e) => e.deviationAfterPct)),
    averageDeviationAfterPctRegularScale: average(
      entries.filter((e) => !e.largeScale).map((e) => e.deviationAfterPct),
    ),
  };
}

export function toBudgetAccuracyInput(
  evalCase: EvalCase,
  result: EvalCaseRunResult,
): BudgetAccuracyCaseInput {
  return {
    id: evalCase.id,
    recipeName: evalCase.recipeName,
    budgetTotal: evalCase.budgetTotal,
    tags: evalCase.tags,
    result,
  };
}
