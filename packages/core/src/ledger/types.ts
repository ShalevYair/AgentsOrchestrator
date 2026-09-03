import {
  OverrunPolicySchema,
  type AgentTier,
  type OverrunPolicy,
  type ReadRung,
  type ThinkingLevel,
  type Usage,
} from "@ao/shared";

/**
 * The six normal spending buckets from BUDGET.md §3. `reserve` is
 * deliberately NOT a member of this union — it is a separate, locked pool
 * (see `buckets.ts`) that no ordinary commit can target, which is what lets
 * TypeScript itself reject most attempts to spend it before a runtime check
 * ever runs.
 */
export const BUDGET_BUCKET_IDS = [
  "recon",
  "planning",
  "checkpoints",
  "execution",
  "synthesis",
  "repair",
] as const;
export type BudgetBucketId = (typeof BUDGET_BUCKET_IDS)[number];

/** Internal-only pseudo-bucket for the locked reserve pool (BUDGET.md §5, level 8). Never exposed as a `BudgetBucketId`. */
export const RESERVE_BUCKET_ID = "reserve";
export type LedgerBucketId = BudgetBucketId | typeof RESERVE_BUCKET_ID;

/**
 * BUDGET.md §1 — the exceed policy chosen alongside the goal button.
 * `ExceedPolicy` is just `OverrunPolicy` (packages/shared's
 * `GoalConfig.overrunPolicy`, P9-T1) under this module's pre-existing
 * name — re-exported rather than redefined, so this package and the
 * goal-button config it eventually drives can never disagree on the
 * three values.
 */
export const EXCEED_POLICIES = OverrunPolicySchema.options;
export type ExceedPolicy = OverrunPolicy;

export interface BucketState {
  /** Tokens allocated to this bucket at construction time — fixed for the life of the Ledger. */
  allocated: number;
  spent: number;
  committed: number;
}

/** `available` is derived, never stored, so it can never drift from `allocated - spent - committed`. */
export interface BucketSnapshot extends BucketState {
  available: number;
}

export interface StageSpendState {
  spent: number;
  committed: number;
}

export interface TokenTotals {
  total: number;
  spent: number;
  committed: number;
  available: number;
  reserve: number;
}

export interface CostTotals {
  /** USD. Kept as a fully separate metric from `TokenTotals` per ADR-004 — a discount on cost is never allowed to move the token count. */
  spentUsd: number;
}

export interface LedgerSnapshot {
  runId?: string;
  tokens: TokenTotals;
  cost: CostTotals;
  buckets: Record<BudgetBucketId, BucketSnapshot>;
  reserveBucket: BucketSnapshot;
  byStage: Record<string, StageSpendState>;
  byAgentType: Record<string, StageSpendState>;
}

let reservationCounter = 0;

/** Returned by `Ledger.commit`/`drawFromReserve` — the only handle that can later `settle`/`release` that specific commitment. */
export interface Reservation {
  readonly id: string;
  readonly bucket: LedgerBucketId;
  readonly stageId: string;
  readonly agentType: string | undefined;
  readonly amount: number;
  /** True only for a level-8 reserve draw that had to be truncated because the reserve pool itself was already exhausted. */
  readonly clamped: boolean;
}

export function nextReservationId(): string {
  reservationCounter += 1;
  return `res_${String(reservationCounter)}`;
}

export interface SettlementResult {
  reservation: Reservation;
  usage: Usage;
  tokensSpent: number;
  costUsd: number;
}

/** Minimal pricing shape `core` needs — deliberately NOT `@ao/providers`'s `ModelPricing` type, so `core` never imports `@ao/providers` (P1-T1's layering rule). Callers (P5's composition root) adapt the real registry entry into this shape. */
export interface ModelPricingLike {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  cachedInputPerMillionUsd?: number;
}

export type PricingLookup = (modelId: string) => ModelPricingLike | undefined;

/** BUDGET.md §4.1's five-step worst-case estimate. `core` never computes step 2 (`countTokens`) itself — that's a live provider call — callers assemble this and pass the total into `admit`. */
export interface WorstCaseEstimate {
  inputTokens: number;
  outputWorst: number;
  thinkingEst: number;
  total: number;
}

export function computeWorstCase(
  inputTokens: number,
  outputWorst: number,
  thinkingEst: number,
): WorstCaseEstimate {
  return { inputTokens, outputWorst, thinkingEst, total: inputTokens + outputWorst + thinkingEst };
}

export const DEGRADATION_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type DegradationLevel = (typeof DEGRADATION_LEVELS)[number];

export interface DegradationEvent {
  level: DegradationLevel;
  action: string;
  reason: string;
  stageId: string;
  worstCaseBefore: number;
  worstCaseAfter: number;
}

export interface CalibrationKey {
  agentType: string;
  thinkingLevel: ThinkingLevel;
}

export interface DegradableSpec {
  /** Retrieval breadth (evidence count) — absent when the stage does no retrieval. */
  retrievalK?: number;
  thinkingLevel: ThinkingLevel;
  fanoutCount: number;
  fanoutMode: "shard" | "ensemble" | "debate" | "pipeline" | "single";
  tier: AgentTier;
  readRung: ReadRung;
  /** Stage.optional from the Plan (PROTOCOLS.md §1) — only an optional stage can be skipped at level 7. */
  optional: boolean;
  /** Set by level 7 once the stage has been dropped entirely — callers must not run it. */
  skipped?: boolean;
}
