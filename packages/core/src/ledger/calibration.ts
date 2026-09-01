import type { CalibrationKey } from "./types.js";

function keyOf(key: CalibrationKey): string {
  return `${key.agentType}::${key.thinkingLevel}`;
}

/** BUDGET.md §4.3's 90th percentile of a sorted sample array (nearest-rank method — simple, deterministic, no interpolation surprises). */
export function percentile90(sortedAscending: readonly number[]): number {
  if (sortedAscending.length === 0) return 1;
  const index = Math.min(sortedAscending.length - 1, Math.ceil(sortedAscending.length * 0.9) - 1);
  return sortedAscending[Math.max(0, index)] ?? 1;
}

export interface CalibrationOptions {
  /** Caps how many samples are retained per key — oldest dropped first. Default 200, generous enough for a stable p90 without unbounded memory growth over a long-lived process. */
  maxSamplesPerKey?: number;
}

/**
 * P4-T6 — records the `actual / worstCase` ratio for every settled call,
 * keyed by `(agentType, thinkingLevel)`, and turns that history into a
 * tightened token reservation for the *next* call of the same kind.
 *
 * The theoretical worst case never stops being computed by the caller and
 * passed in as `worstCase` — this class only ever scales it down (or,
 * if actuals ever ran hot, clamps back up to it), so `worstCase` remains
 * the hard-cap safety net exactly as BUDGET.md §4.3 requires: calibration
 * moves the *reservation*, never the *cap*.
 */
export class CalibrationStore {
  private readonly maxSamplesPerKey: number;
  private readonly samples = new Map<string, number[]>();

  constructor(options: CalibrationOptions = {}) {
    this.maxSamplesPerKey = options.maxSamplesPerKey ?? 200;
  }

  /** Called from `Ledger.settle`'s call site (P4-T4) once `actual` usage is known — `worstCase` is the theoretical estimate that admitted the call. */
  record(key: CalibrationKey, worstCase: number, actual: number): void {
    if (worstCase <= 0) return; // a ratio against zero is meaningless — nothing to learn from a free call
    const ratio = actual / worstCase;
    const list = this.samples.get(keyOf(key)) ?? [];
    list.push(ratio);
    if (list.length > this.maxSamplesPerKey) list.shift();
    this.samples.set(keyOf(key), list);
  }

  /** How many samples have been recorded for `key` — 0 means "estimate() will just return worstCaseHint unchanged". */
  sampleCount(key: CalibrationKey): number {
    return this.samples.get(keyOf(key))?.length ?? 0;
  }

  /**
   * The calibrated reservation for the next call of this `(agentType,
   * thinkingLevel)`, given the theoretical `worstCaseHint` for that call.
   * With zero recorded samples this returns `worstCaseHint` unchanged (no
   * data to tighten with yet — "from the second run onward" per BUDGET.md
   * §4.3, since the first run is what produces the first sample). The
   * result is always clamped to `worstCaseHint` itself, so calibration can
   * never push the reservation above the hard-cap safety net even if a
   * past call ran hotter than its own worst case predicted.
   */
  estimate(key: CalibrationKey, worstCaseHint: number): number {
    const list = this.samples.get(keyOf(key));
    if (!list || list.length === 0) return worstCaseHint;
    const sorted = [...list].sort((a, b) => a - b);
    const ratio = percentile90(sorted);
    const reservation = Math.ceil(worstCaseHint * ratio);
    return Math.min(worstCaseHint, Math.max(0, reservation));
  }
}
