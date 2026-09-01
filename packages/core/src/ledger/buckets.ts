import { BudgetReserveLockedError, ConfigError } from "@ao/shared";
import { BUDGET_BUCKET_IDS, type BudgetBucketId } from "./types.js";

/** BUDGET.md §3's default percentage split. Sums to 88% — the remaining 12% is `RESERVE_PERCENTAGE`, not part of this table, so it can never be tuned through the same knob. */
export const DEFAULT_BUCKET_PERCENTAGES: Readonly<Record<BudgetBucketId, number>> = {
  recon: 0.02,
  planning: 0.03,
  checkpoints: 0.04,
  execution: 0.58,
  synthesis: 0.12,
  repair: 0.09,
};

/** BUDGET.md §3 — "לא מוקצה. נוגעים בו רק לפי §5" (untouched except via the degradation ladder's level 8). Fixed; there is no parameter anywhere in this module that can change it. */
export const RESERVE_PERCENTAGE = 0.12;

export interface BudgetAllocation {
  total: number;
  buckets: Record<BudgetBucketId, number>;
  reserve: number;
}

/**
 * Splits `total` into the six spending buckets plus the locked reserve, per
 * BUDGET.md §3. `percentages` may override the six normal buckets — BUDGET.md
 * says the planner "can deviate within limits" — but there is deliberately no
 * way to pass a reserve override into this function's signature at all; the
 * type system itself is the enforcement that reserve's 12% can't be tuned
 * away here. Runtime tuning of the *normal* buckets is still validated:
 * their percentages must be non-negative and must not, combined with the
 * fixed reserve, exceed 100% of `total`.
 */
export function allocateBudget(
  total: number,
  percentages: Readonly<Partial<Record<BudgetBucketId, number>>> = DEFAULT_BUCKET_PERCENTAGES,
): BudgetAllocation {
  if (!Number.isFinite(total) || total <= 0) {
    throw new ConfigError(`allocateBudget requires a positive total, got ${String(total)}`);
  }

  const resolved: Record<BudgetBucketId, number> = { ...DEFAULT_BUCKET_PERCENTAGES, ...percentages };
  let bucketPercentageSum = 0;
  for (const id of BUDGET_BUCKET_IDS) {
    const pct = resolved[id];
    if (!Number.isFinite(pct) || pct < 0) {
      throw new ConfigError(`bucket "${id}" has an invalid percentage: ${String(pct)}`);
    }
    bucketPercentageSum += pct;
  }
  if (bucketPercentageSum + RESERVE_PERCENTAGE > 1 + 1e-9) {
    throw new ConfigError(
      `bucket percentages (${String(bucketPercentageSum)}) plus the fixed reserve ` +
        `(${String(RESERVE_PERCENTAGE)}) exceed 100% of the budget`,
    );
  }

  const buckets = {} as Record<BudgetBucketId, number>;
  for (const id of BUDGET_BUCKET_IDS) {
    buckets[id] = Math.floor(total * resolved[id]);
  }
  const reserve = Math.floor(total * RESERVE_PERCENTAGE);

  return { total, buckets, reserve };
}

/**
 * The one and only runtime gate that proves "reserve is never allocatable
 * through a normal path" (P4-T2's done-criterion): every caller that wants
 * to spend against a bucket — `Ledger.commit`, plan validation, anything
 * else built on top of this package — must route the requested bucket id
 * through this guard first. `LedgerBucketId` (types.ts) includes
 * `"reserve"` precisely so a value arriving from untyped input (a JSON plan
 * patch, a deserialized event) can still be checked here instead of being
 * silently accepted by a permissive string type.
 */
export function assertSpendableBucket(bucket: string): asserts bucket is BudgetBucketId {
  if (bucket === "reserve") {
    throw new BudgetReserveLockedError(
      "the reserve bucket is locked — it can only be drawn via the level-8 degradation step (Ledger.drawFromReserve)",
    );
  }
  if (!(BUDGET_BUCKET_IDS as readonly string[]).includes(bucket)) {
    throw new ConfigError(`unknown budget bucket: "${bucket}"`);
  }
}
