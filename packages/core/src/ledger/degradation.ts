import type { Ledger } from "./ledger.js";
import { admit, type AdmitRequest } from "./admission.js";
import type {
  DegradableSpec,
  DegradationEvent,
  DegradationLevel,
  ExceedPolicy,
  Reservation,
} from "./types.js";

/** BUDGET.md §5's table, in order. Index 0 is level 1. */
const LEVEL_LABELS: Readonly<Record<DegradationLevel, string>> = {
  1: "reduce-retrieval-k",
  2: "lower-thinking-level",
  3: "reduce-fanout-count",
  4: "ensemble-to-single",
  5: "downgrade-to-cheap-tier",
  6: "lower-read-rung",
  7: "skip-optional-stage",
  8: "stop-and-synthesize-from-reserve",
};

const THINKING_ORDER = ["low", "medium", "high"] as const;
const READ_RUNGS = ["R0", "R1", "R2", "R3", "R4", "R5"] as const;

function cloneSpec(spec: DegradableSpec): DegradableSpec {
  return { ...spec };
}

/**
 * Applies a single degradation level (1-7) to `spec`, returning the
 * transformed spec, or `null` when the step doesn't apply — already at its
 * floor, or a precondition isn't met (e.g. level 4 only applies to
 * `ensemble`/`debate`). Level 8 is not a spec transform (it draws from the
 * ledger's reserve directly) and is handled by `runDegradationLadder`
 * instead, not by this function.
 */
export function applyDegradationStep(
  level: Exclude<DegradationLevel, 8>,
  spec: DegradableSpec,
): DegradableSpec | null {
  const next = cloneSpec(spec);
  switch (level) {
    case 1: {
      if (spec.retrievalK === undefined || spec.retrievalK <= 1) return null;
      next.retrievalK = Math.max(1, Math.floor(spec.retrievalK / 2));
      return next;
    }
    case 2: {
      const index = THINKING_ORDER.indexOf(spec.thinkingLevel);
      if (index <= 0) return null; // already "low"
      next.thinkingLevel = THINKING_ORDER[index - 1] ?? spec.thinkingLevel;
      return next;
    }
    case 3: {
      if (spec.fanoutCount <= 1) return null;
      next.fanoutCount = Math.max(1, Math.ceil(spec.fanoutCount / 2));
      return next;
    }
    case 4: {
      if (spec.fanoutMode !== "ensemble" && spec.fanoutMode !== "debate") return null;
      next.fanoutMode = "single";
      next.fanoutCount = 1;
      return next;
    }
    case 5: {
      if (spec.tier !== "worker") return null;
      next.tier = "cheap";
      return next;
    }
    case 6: {
      const index = READ_RUNGS.indexOf(spec.readRung);
      if (index <= 0) return null; // already R0
      next.readRung = READ_RUNGS[index - 1] ?? spec.readRung;
      return next;
    }
    case 7: {
      if (!spec.optional || spec.skipped) return null;
      next.skipped = true;
      return next;
    }
    default: {
      const exhaustive: never = level;
      return exhaustive;
    }
  }
}

export interface DegradationApprovedOutcome {
  decision: "approved";
  reservation: Reservation;
  spec: DegradableSpec;
  events: DegradationEvent[];
}

/** BUDGET.md §5's `ask` policy: the caller (UI) decides — this package never auto-degrades on its behalf. */
export interface DegradationNeedsUserDecisionOutcome {
  decision: "needs-user-decision";
  spec: DegradableSpec;
  worstCase: number;
  events: DegradationEvent[];
}

export type DegradationOutcome = DegradationApprovedOutcome | DegradationNeedsUserDecisionOutcome;

export interface DegradationOptions {
  policy?: ExceedPolicy;
}

/**
 * P4-T5 — the full 8-level ladder. `recomputeWorstCase` re-estimates the
 * request's cost after each spec transform; `core` has no provider to call
 * itself, so this stays injected (same reasoning as `AdmitRequest.worstCase`
 * itself). Stops at the first level whose admission succeeds
 * ("עוצרים ברגע שהקריאה נכנסת"). Level 8 always succeeds — it draws from
 * the ledger's locked reserve, which never throws, only clamps.
 *
 * - `policy: "degrade"` (default): tries plain admission, then levels 1-7 in
 *   order, then guarantees success at level 8.
 * - `policy: "hard-stop"`: skips straight to level 8 the moment plain
 *   admission fails — no levels 1-7 attempted.
 * - `policy: "ask"`: never auto-degrades. Returns `needs-user-decision` the
 *   moment plain admission fails, so the caller (UI) can offer "raise
 *   budget / degrade / stop with what exists" per BUDGET.md §5.
 */
export function runDegradationLadder(
  ledger: Ledger,
  request: AdmitRequest,
  spec: DegradableSpec,
  recomputeWorstCase: (spec: DegradableSpec) => number,
  options: DegradationOptions = {},
): DegradationOutcome {
  const policy = options.policy ?? "degrade";
  const events: DegradationEvent[] = [];

  const initial = admit(ledger, request);
  if (initial.decision === "approved") {
    return { decision: "approved", reservation: initial.reservation, spec, events };
  }

  if (policy === "ask") {
    return { decision: "needs-user-decision", spec, worstCase: request.worstCase, events };
  }

  let currentSpec = spec;
  let currentWorstCase = request.worstCase;

  if (policy === "degrade") {
    for (const level of [1, 2, 3, 4, 5, 6, 7] as const) {
      const transformed = applyDegradationStep(level, currentSpec);
      if (transformed === null) continue;

      const worstCaseAfter = transformed.skipped ? 0 : recomputeWorstCase(transformed);
      events.push({
        level,
        action: LEVEL_LABELS[level],
        reason: `budget exceeded at stage "${request.stageId}" — applying degradation level ${String(level)}`,
        stageId: request.stageId,
        worstCaseBefore: currentWorstCase,
        worstCaseAfter,
      });
      currentSpec = transformed;
      currentWorstCase = worstCaseAfter;

      const attempt = admit(ledger, { ...request, worstCase: worstCaseAfter });
      if (attempt.decision === "approved") {
        return { decision: "approved", reservation: attempt.reservation, spec: currentSpec, events };
      }
    }
  }

  // Level 8: guaranteed. hard-stop jumps straight here; degrade falls
  // through here once levels 1-7 are exhausted.
  const reserveOptions: { stageId: string; agentType?: string } = { stageId: request.stageId };
  if (request.agentType !== undefined) reserveOptions.agentType = request.agentType;
  const reservation = ledger.drawFromReserve(currentWorstCase, reserveOptions);
  events.push({
    level: 8,
    action: LEVEL_LABELS[8],
    reason: reservation.clamped
      ? `reserve exhausted — stopped with a partial synthesis (${String(reservation.amount)} of ${String(currentWorstCase)} tokens granted)`
      : "budget fully exhausted after degradation — stopping and synthesizing from the locked reserve",
    stageId: request.stageId,
    worstCaseBefore: currentWorstCase,
    worstCaseAfter: reservation.amount,
  });
  return { decision: "approved", reservation, spec: { ...currentSpec, skipped: false }, events };
}
