import type { Ledger } from "./ledger.js";
import type { DegradationEvent, StageSpendState } from "./types.js";

/** BUDGET.md §7's savings levers, in the doc's own effectiveness order. */
export const SAVINGS_LEVER_IDS = [
  "local-processing",
  "artifact-hash-cache",
  "context-cache",
  "model-tier",
  "local-merge",
  "response-cache",
  "finding-dedup",
  "batch-api",
] as const;
export type SavingsLeverId = (typeof SAVINGS_LEVER_IDS)[number];

/**
 * A single "this lever saved N tokens" fact. `core` never measures these
 * itself — it has no cache, no ingestion pipeline, no scheduler — so every
 * other package that owns a lever (ArtifactStore's hash cache, the
 * provider's response cache and context cache, the Blackboard's
 * dedup, Reducers' local merges) reports its own savings into the run's
 * report via this shape.
 */
export interface SavingsRecord {
  lever: SavingsLeverId;
  tokensSaved: number;
  note?: string;
}

export interface TokenReport {
  /** Non-reserve spend/committed only — mirrors `Ledger.spent`/`Ledger.committed` exactly. */
  totalSpent: number;
  totalCommitted: number;
  /** Whatever was drawn from the locked reserve (BUDGET.md §5, level 8) — tracked separately so a reader can see explicitly when and how much the run had to fall back to it. */
  reserveSpent: number;
  reserveCommitted: number;
  /** `totalSpent + reserveSpent` — the true total token cost of the run, reserve included. Never used for admission (that stays `Ledger.available`'s job); this is reporting-only. */
  grandTotalSpent: number;
  totalCostUsd: number;
  byStage: Record<string, StageSpendState>;
  byAgentType: Record<string, StageSpendState>;
  byLever: Record<SavingsLeverId, number>;
  totalSaved: number;
  degradations: DegradationEvent[];
  degradationCountByLevel: Record<number, number>;
}

/**
 * P4-T8 — "לאן הלכו הטוקנים". Combines the Ledger's own per-stage/per-agent
 * breakdown (already tracked by every `commit`/`settle` call, P4-T1/T4)
 * with savings facts and degradation events collected over the run by
 * whichever other components own each lever.
 */
export function buildTokenReport(
  ledger: Ledger,
  savings: readonly SavingsRecord[] = [],
  degradations: readonly DegradationEvent[] = [],
): TokenReport {
  const snapshot = ledger.snapshot();

  const byLever = Object.fromEntries(SAVINGS_LEVER_IDS.map((id) => [id, 0])) as Record<
    SavingsLeverId,
    number
  >;
  let totalSaved = 0;
  for (const record of savings) {
    byLever[record.lever] += record.tokensSaved;
    totalSaved += record.tokensSaved;
  }

  const degradationCountByLevel: Record<number, number> = {};
  for (const event of degradations) {
    degradationCountByLevel[event.level] = (degradationCountByLevel[event.level] ?? 0) + 1;
  }

  return {
    totalSpent: snapshot.tokens.spent,
    totalCommitted: snapshot.tokens.committed,
    reserveSpent: snapshot.reserveBucket.spent,
    reserveCommitted: snapshot.reserveBucket.committed,
    grandTotalSpent: snapshot.tokens.spent + snapshot.reserveBucket.spent,
    totalCostUsd: snapshot.cost.spentUsd,
    byStage: snapshot.byStage,
    byAgentType: snapshot.byAgentType,
    byLever,
    totalSaved,
    degradations: [...degradations],
    degradationCountByLevel,
  };
}
