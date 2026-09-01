import type { Plan, Stage, ThinkingLevel } from "@ao/shared";
import { allocateBudget } from "./buckets.js";
import type { CalibrationStore } from "./calibration.js";
import type { BudgetBucketId, ModelPricingLike, PricingLookup } from "./types.js";

export interface SimulatorStageSummary {
  stageId: string;
  name: string;
  agentCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  totalTokens: number;
  percentOfBudget: number;
}

export interface SimulatorResult {
  stages: SimulatorStageSummary[];
  /** Sum of every stage's tokenBudget — BUDGET.md §6's "ביצוע" row. */
  executionTotal: number;
  /**
   * Checkpoints + planning only (BUDGET.md §6's "צ'קפוינטים + תכנון +
   * תיקונים" row). Repair is deliberately excluded from the *pre-run*
   * estimate: it's contingency spend for retries/continuations that
   * haven't happened yet, so a dry run has nothing concrete to attribute
   * to it — this matches the doc's own worked example, where 4%+3%=7%
   * (≈180K of a 2.5M budget) is exactly the row's number with no repair
   * component. Repair still gets its own locked allocation from
   * `allocateBudget` for the real run; it's just not pretended to be a
   * known cost ahead of time.
   */
  overheadTotal: number;
  /** The locked reserve (BUDGET.md §3) — always included, never touchable by execution. */
  reserveTotal: number;
  grandTotal: number;
  budgetTotal: number;
  percentOfBudget: number;
  remainingTokens: number;
  estimatedCostUsd?: number;
}

export interface SimulatePlanOptions {
  bucketPercentages?: Readonly<Partial<Record<BudgetBucketId, number>>>;
  /** When supplied, each stage's estimate is tightened by calibration data before being summed — BUDGET.md §4.4/§6: "הדיוק משתפר עם כל ריצה." */
  calibration?: CalibrationStore;
  /** Plan stages don't carry a `thinkingLevel` field (that lives on the agent invocation, not the static Plan) — supply a resolver to key calibration lookups correctly; defaults to "medium" for every stage. */
  resolveThinkingLevel?: (stage: Stage) => ThinkingLevel;
  pricing?: PricingLookup;
  /** Which model's price list to apply to the aggregate estimate — the simulator works at the Plan level, before per-call model selection, so the caller names one (typically `tier.worker`'s id). */
  costModelId?: string;
}

function calibrateStageTokens(
  stage: Stage,
  calibration: CalibrationStore | undefined,
  resolveThinkingLevel: ((stage: Stage) => ThinkingLevel) | undefined,
): { estimatedIn: number; estimatedOut: number } {
  const rawIn = stage.tokenBudget.estimatedIn;
  const rawOut = stage.tokenBudget.estimatedOut;
  if (!calibration) return { estimatedIn: rawIn, estimatedOut: rawOut };

  const rawTotal = rawIn + rawOut;
  if (rawTotal <= 0) return { estimatedIn: rawIn, estimatedOut: rawOut };

  const thinkingLevel = resolveThinkingLevel?.(stage) ?? "medium";
  const calibratedTotal = calibration.estimate({ agentType: stage.agentType, thinkingLevel }, rawTotal);
  const scale = calibratedTotal / rawTotal;
  return { estimatedIn: Math.round(rawIn * scale), estimatedOut: Math.round(rawOut * scale) };
}

function estimateCostUsd(
  price: ModelPricingLike | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!price) return 0;
  return (inputTokens * price.inputPerMillionUsd + outputTokens * price.outputPerMillionUsd) / 1_000_000;
}

/**
 * P4-T7 — prices a Plan before a single token is spent, matching the shape
 * of BUDGET.md §6's worked example: a per-stage table, an execution total,
 * an overhead total, the locked reserve, and a grand total against
 * `budgetTotal` with a percentage and (when pricing is supplied) a USD
 * estimate.
 */
export function simulatePlan(
  plan: Plan,
  budgetTotal: number,
  options: SimulatePlanOptions = {},
): SimulatorResult {
  const allocation = allocateBudget(budgetTotal, options.bucketPercentages);

  let totalIn = 0;
  let totalOut = 0;
  const stages: SimulatorStageSummary[] = plan.stages.map((stage) => {
    const { estimatedIn, estimatedOut } = calibrateStageTokens(
      stage,
      options.calibration,
      options.resolveThinkingLevel,
    );
    totalIn += estimatedIn;
    totalOut += estimatedOut;
    const totalTokens = estimatedIn + estimatedOut;
    return {
      stageId: stage.id,
      name: stage.name,
      agentCount: stage.fanout.count,
      estimatedInputTokens: estimatedIn,
      estimatedOutputTokens: estimatedOut,
      totalTokens,
      percentOfBudget: budgetTotal > 0 ? totalTokens / budgetTotal : 0,
    };
  });

  const executionTotal = totalIn + totalOut;
  const overheadTotal = allocation.buckets.checkpoints + allocation.buckets.planning;
  const reserveTotal = allocation.reserve;
  const grandTotal = executionTotal + overheadTotal + reserveTotal;

  const result: SimulatorResult = {
    stages,
    executionTotal,
    overheadTotal,
    reserveTotal,
    grandTotal,
    budgetTotal,
    percentOfBudget: budgetTotal > 0 ? grandTotal / budgetTotal : 0,
    remainingTokens: budgetTotal - grandTotal,
  };

  if (options.pricing && options.costModelId !== undefined) {
    const price = options.pricing(options.costModelId);
    result.estimatedCostUsd = estimateCostUsd(price, totalIn, totalOut);
  }

  return result;
}
