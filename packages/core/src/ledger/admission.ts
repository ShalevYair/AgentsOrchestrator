import { BudgetExceededError, type Usage } from "@ao/shared";
import type { Ledger } from "./ledger.js";
import type { BudgetBucketId, Reservation } from "./types.js";

export interface AdmitRequest {
  bucket: BudgetBucketId;
  stageId: string;
  agentType?: string;
  /** BUDGET.md §4.1's `worstCase` — precomputed by the caller (a real `provider.countTokens()` plus the output/thinking estimate). `core` never estimates this itself; it has no provider to call. */
  worstCase: number;
}

export type AdmitOutcome =
  { decision: "approved"; reservation: Reservation } | { decision: "rejected"; reason: string };

/**
 * P4-T3 — BUDGET.md §4.1, step 6's decision itself: does `worstCase` fit in
 * what's left of the run? This function is the ONLY thing in this package
 * that decides "yes, commit"; every mutation of `committed` for a normal
 * bucket flows through here (or through `runAdmitted`, which just wraps
 * this with the settle/release lifecycle — see below).
 */
export function admit(ledger: Ledger, request: AdmitRequest): AdmitOutcome {
  if (request.worstCase < 0) {
    return {
      decision: "rejected",
      reason: `worstCase must be non-negative, got ${String(request.worstCase)}`,
    };
  }
  if (request.worstCase > ledger.available) {
    return {
      decision: "rejected",
      reason:
        `worst-case ${String(request.worstCase)} exceeds available budget ${String(ledger.available)} ` +
        `for stage "${request.stageId}"`,
    };
  }
  const options: { bucket: string; stageId: string; agentType?: string } = {
    bucket: request.bucket,
    stageId: request.stageId,
  };
  if (request.agentType !== undefined) options.agentType = request.agentType;
  const reservation = ledger.commit(request.worstCase, options);
  return { decision: "approved", reservation };
}

export interface AdmittedCallResult<T> {
  usage: Usage;
  modelId?: string;
  result: T;
}

/**
 * P4-T3's "single wrapper" enforcement point. `execute` stands in for
 * "the code that actually reaches the provider" — the point of this
 * function is that `execute` is invoked from exactly one place in this
 * entire package (the line below), and that line only runs after `admit`
 * has approved the request. A caller (P5's scheduler) that always drives
 * its provider calls through `runAdmitted` therefore cannot reach a
 * provider without going through admission first — there is no second
 * code path here that invokes `execute`.
 *
 * On success, settles the reservation with the real usage automatically.
 * On failure, releases the reservation (no leaked `committed`) and
 * re-throws. A rejected admission throws `BudgetExceededError` without
 * ever calling `execute` at all — proven by `admission.test.ts`.
 */
export async function runAdmitted<T>(
  ledger: Ledger,
  request: AdmitRequest,
  execute: (reservation: Reservation) => Promise<AdmittedCallResult<T>>,
): Promise<T> {
  const outcome = admit(ledger, request);
  if (outcome.decision !== "approved") {
    throw new BudgetExceededError(`admission rejected for stage "${request.stageId}": ${outcome.reason}`, {
      details: { stageId: request.stageId, worstCase: request.worstCase },
    });
  }
  try {
    const { usage, modelId, result } = await execute(outcome.reservation);
    ledger.settle(outcome.reservation, usage, modelId);
    return result;
  } catch (error) {
    ledger.release(outcome.reservation);
    throw error;
  }
}
