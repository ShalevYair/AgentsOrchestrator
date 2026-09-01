import { ConfigError, type Usage } from "@ao/shared";
import { allocateBudget, assertSpendableBucket, type BudgetAllocation } from "./buckets.js";
import {
  BUDGET_BUCKET_IDS,
  nextReservationId,
  RESERVE_BUCKET_ID,
  type BucketSnapshot,
  type BucketState,
  type BudgetBucketId,
  type LedgerBucketId,
  type LedgerSnapshot,
  type PricingLookup,
  type Reservation,
  type SettlementResult,
  type StageSpendState,
} from "./types.js";

export interface LedgerOptions {
  /** `budget.total` from the goal button (BUDGET.md §1) — token count, never dollars. */
  total: number;
  runId?: string;
  /** BUDGET.md §3 bucket-percentage overrides for the six normal buckets. Reserve is never overridable here — see buckets.ts. */
  bucketPercentages?: Readonly<Partial<Record<BudgetBucketId, number>>>;
  /**
   * ADR-004 / `ledger.cachedTokensWeight` — how much of `Usage.cachedTokens`
   * counts toward the TOKEN ledger. Default 1 = full weight, matching the
   * decision text exactly ("נספר במלוא הטוקנים"). This only affects the
   * token metric; cost is discounted independently via `pricing`, never
   * through this knob.
   */
  cachedTokensWeight?: number;
  /** Looks up USD pricing for a model id. Cost tracking is best-effort: a call whose model has no pricing entry still settles tokens correctly, it just contributes $0 to `cost.spentUsd`. */
  pricing?: PricingLookup;
}

function emptyBucketState(allocated: number): BucketState {
  return { allocated, spent: 0, committed: 0 };
}

function toSnapshot(state: BucketState): BucketSnapshot {
  return { ...state, available: state.allocated - state.spent - state.committed };
}

function emptySpendState(): StageSpendState {
  return { spent: 0, committed: 0 };
}

/**
 * P4-T1 / P4-T4 — a pure, zero-I/O token+cost ledger. Every mutating method
 * is synchronous and touches nothing outside its own in-memory state; there
 * is no network, filesystem, or provider call anywhere in this file.
 *
 * Token accounting and cost accounting are tracked as fully separate
 * metrics throughout (ADR-004): `commit`/`settle` always move real token
 * counts, and `spentUsd` is a derived side-effect of `settle` that never
 * feeds back into any token field.
 */
export class Ledger {
  readonly runId: string | undefined;
  private readonly cachedTokensWeight: number;
  private readonly pricing: PricingLookup | undefined;
  private readonly allocation: BudgetAllocation;

  private readonly buckets: Record<BudgetBucketId, BucketState>;
  private readonly reserveBucket: BucketState;
  private reserveDrawnEver = 0;

  private spentUsd = 0;
  private readonly byStage = new Map<string, StageSpendState>();
  private readonly byAgentType = new Map<string, StageSpendState>();
  private readonly reservations = new Map<string, Reservation>();

  constructor(options: LedgerOptions) {
    if (options.runId !== undefined) this.runId = options.runId;
    this.cachedTokensWeight = options.cachedTokensWeight ?? 1;
    if (options.pricing !== undefined) this.pricing = options.pricing;
    this.allocation = allocateBudget(options.total, options.bucketPercentages);

    this.buckets = {} as Record<BudgetBucketId, BucketState>;
    for (const id of BUDGET_BUCKET_IDS) {
      this.buckets[id] = emptyBucketState(this.allocation.buckets[id]);
    }
    this.reserveBucket = emptyBucketState(this.allocation.reserve);
  }

  // ---- run-level token totals (BUDGET.md §3's ASCII diagram) ----

  get total(): number {
    return this.allocation.total;
  }

  /** Sum of `spent` across the six normal buckets only — reserve spend is tracked separately and never inflates this figure until it's drawn, at which point it still doesn't join here (see `available`'s doc comment). */
  get spent(): number {
    return this.sumNonReserve((b) => b.spent);
  }

  get committed(): number {
    return this.sumNonReserve((b) => b.committed);
  }

  /** The fixed reserve allocation (BUDGET.md §3's locked 12% segment) — constant for the Ledger's lifetime, not "remaining reserve". Use `reserveSnapshot()` for the live remaining/spent/committed breakdown of the reserve pool itself. */
  get reserve(): number {
    return this.reserveBucket.allocated;
  }

  /**
   * `total − spent − committed − reserve`, exactly as BUDGET.md §4.1 defines
   * it. The reserve segment is subtracted at its full fixed size regardless
   * of how much of it has actually been drawn — it was never part of the
   * spendable pool to begin with, so drawing from it (level 8) does not
   * "free up" anything here. This is what `admit()` checks against.
   */
  get available(): number {
    return this.total - this.spent - this.committed - this.reserve;
  }

  get costSpentUsd(): number {
    return this.spentUsd;
  }

  private sumNonReserve(pick: (b: BucketState) => number): number {
    let sum = 0;
    for (const id of BUDGET_BUCKET_IDS) sum += pick(this.buckets[id]);
    return sum;
  }

  bucketSnapshot(bucket: BudgetBucketId): BucketSnapshot {
    return toSnapshot(this.buckets[bucket]);
  }

  reserveSnapshot(): BucketSnapshot {
    return toSnapshot(this.reserveBucket);
  }

  // ---- P4-T3's low-level primitive: committing against a normal bucket ----

  /**
   * Reserves `amount` tokens against `bucket` for `stageId` (BUDGET.md
   * §4.1, step 6's "✅" branch). Throws `BudgetReserveLockedError` if
   * `bucket` is `"reserve"` or unknown (`assertSpendableBucket`), and
   * `ConfigError` if `amount` would push the run-level `available` below
   * zero — callers are expected to have already checked `available` (that
   * check is `admit()`'s job, in `admission.ts`); this method is the
   * mechanical half, not the policy half.
   */
  commit(amount: number, options: { bucket: string; stageId: string; agentType?: string }): Reservation {
    assertSpendableBucket(options.bucket);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ConfigError(`commit amount must be a non-negative number, got ${String(amount)}`);
    }
    if (amount > this.available) {
      throw new ConfigError(
        `commit of ${String(amount)} tokens exceeds available budget (${String(this.available)}) — ` +
          "callers must check admit()/available before committing",
      );
    }

    const bucketState = this.buckets[options.bucket];
    bucketState.committed += amount;

    const reservation: Reservation = {
      id: nextReservationId(),
      bucket: options.bucket,
      stageId: options.stageId,
      agentType: options.agentType,
      amount,
      clamped: false,
    };
    this.reservations.set(reservation.id, reservation);
    this.touchStage(options.stageId).committed += amount;
    if (options.agentType !== undefined) this.touchAgentType(options.agentType).committed += amount;
    return reservation;
  }

  /**
   * The ONLY path that can spend from the locked reserve (BUDGET.md §5,
   * level 8) — used exclusively by the degradation ladder's final step.
   * Unlike `commit`, this never throws for insufficient funds: it clamps to
   * whatever remains in the reserve pool (down to 0) and always returns a
   * reservation, because level 8 is architecturally guaranteed to succeed.
   * `reservation.clamped` tells the caller whether the amount they asked
   * for had to be truncated, so a caller can report a smaller-than-hoped
   * final synthesis rather than silently pretending it got the full amount.
   */
  drawFromReserve(amount: number, options: { stageId: string; agentType?: string }): Reservation {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ConfigError(`drawFromReserve amount must be a non-negative number, got ${String(amount)}`);
    }
    const remaining = this.reserveBucket.allocated - this.reserveBucket.spent - this.reserveBucket.committed;
    const granted = Math.max(0, Math.min(amount, remaining));
    const clamped = granted < amount;

    this.reserveBucket.committed += granted;
    this.reserveDrawnEver += granted;

    const reservation: Reservation = {
      id: nextReservationId(),
      bucket: RESERVE_BUCKET_ID,
      stageId: options.stageId,
      agentType: options.agentType,
      amount: granted,
      clamped,
    };
    this.reservations.set(reservation.id, reservation);
    this.touchStage(options.stageId).committed += granted;
    if (options.agentType !== undefined) this.touchAgentType(options.agentType).committed += granted;
    return reservation;
  }

  /** Total ever drawn from reserve across the Ledger's lifetime — for reporting (P4-T8), independent of how much has since settled vs. is still committed. */
  get reserveDrawnTotal(): number {
    return this.reserveDrawnEver;
  }

  // ---- P4-T4: settlement ----

  /**
   * Resolves a successful call: releases `reservation`'s `committed` hold
   * and records the real `usage` into `spent`/cost. BUDGET.md §4.2, steps
   * 7-8. Cached tokens count at `cachedTokensWeight` (default 1 = full
   * weight) toward the TOKEN total per ADR-004, while cost applies its own
   * independent discount via `pricing().cachedInputPerMillionUsd` — the two
   * never share a code path.
   */
  settle(reservation: Reservation, usage: Usage, modelId?: string): SettlementResult {
    this.releaseReservationHandle(reservation);

    const nonCachedPrompt = Math.max(0, usage.promptTokens - usage.cachedTokens);
    const weightedCached = usage.cachedTokens * this.cachedTokensWeight;
    const tokensSpent = nonCachedPrompt + weightedCached + usage.candidatesTokens + usage.thoughtsTokens;

    const bucketState = this.bucketStateFor(reservation.bucket);
    bucketState.spent += tokensSpent;
    this.touchStage(reservation.stageId).spent += tokensSpent;
    if (reservation.agentType !== undefined) this.touchAgentType(reservation.agentType).spent += tokensSpent;

    const costUsd = modelId !== undefined ? this.computeCostUsd(modelId, usage) : 0;
    this.spentUsd += costUsd;

    return { reservation, usage, tokensSpent, costUsd };
  }

  /**
   * Resolves a failed or canceled call: releases `reservation`'s
   * `committed` hold with zero added to `spent`. This is what makes "a
   * failed call must not leak `committed`" true — there is no other way to
   * remove a reservation's hold on the ledger.
   */
  release(reservation: Reservation): void {
    this.releaseReservationHandle(reservation);
  }

  private releaseReservationHandle(reservation: Reservation): void {
    if (!this.reservations.has(reservation.id)) {
      throw new ConfigError(
        `reservation ${reservation.id} was already settled or released — a reservation can only be resolved once`,
      );
    }
    this.reservations.delete(reservation.id);
    const bucketState = this.bucketStateFor(reservation.bucket);
    bucketState.committed -= reservation.amount;
    this.touchStage(reservation.stageId).committed -= reservation.amount;
    if (reservation.agentType !== undefined)
      this.touchAgentType(reservation.agentType).committed -= reservation.amount;
  }

  private bucketStateFor(bucket: LedgerBucketId): BucketState {
    return bucket === RESERVE_BUCKET_ID ? this.reserveBucket : this.buckets[bucket];
  }

  /** Number of reservations still open (committed, not yet settled/released) — used by tests and by `report.ts` to catch leaks. */
  get openReservationCount(): number {
    return this.reservations.size;
  }

  private computeCostUsd(modelId: string, usage: Usage): number {
    const price = this.pricing?.(modelId);
    if (!price) return 0;
    const nonCachedPrompt = Math.max(0, usage.promptTokens - usage.cachedTokens);
    const cachedPricePerMillion = price.cachedInputPerMillionUsd ?? price.inputPerMillionUsd;
    const inputCost =
      (nonCachedPrompt * price.inputPerMillionUsd + usage.cachedTokens * cachedPricePerMillion) / 1_000_000;
    const outputCost =
      ((usage.candidatesTokens + usage.thoughtsTokens) * price.outputPerMillionUsd) / 1_000_000;
    return inputCost + outputCost;
  }

  private touchStage(stageId: string): StageSpendState {
    let state = this.byStage.get(stageId);
    if (!state) {
      state = emptySpendState();
      this.byStage.set(stageId, state);
    }
    return state;
  }

  private touchAgentType(agentType: string): StageSpendState {
    let state = this.byAgentType.get(agentType);
    if (!state) {
      state = emptySpendState();
      this.byAgentType.set(agentType, state);
    }
    return state;
  }

  snapshot(): LedgerSnapshot {
    const buckets = {} as Record<BudgetBucketId, BucketSnapshot>;
    for (const id of BUDGET_BUCKET_IDS) buckets[id] = toSnapshot(this.buckets[id]);

    return {
      ...(this.runId !== undefined ? { runId: this.runId } : {}),
      tokens: {
        total: this.total,
        spent: this.spent,
        committed: this.committed,
        available: this.available,
        reserve: this.reserve,
      },
      cost: { spentUsd: this.spentUsd },
      buckets,
      reserveBucket: this.reserveSnapshot(),
      byStage: Object.fromEntries(this.byStage),
      byAgentType: Object.fromEntries(this.byAgentType),
    };
  }
}
