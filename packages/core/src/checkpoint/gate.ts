/**
 * P6-T1 + P6-T5 — the actual call-or-don't-call decision. PROTOCOLS.md §6:
 * "אין אות → ממשיכים בלי לשלם כלום. יש אות (או שזו נקודת חובה...) → קריאה
 * זולה". `runCheckpointGate` is that whole sentence as one function: it
 * never reaches the `checkpoint` agent (P6-T2, `runCheckpoint`) unless at
 * least one of the six signals fired (`anySignalFired`, P6-T1) or the
 * caller marks this call site mandatory (P6-T5's three fixed points —
 * after recon, after the first stage, before synthesis).
 */

import type { CheckpointDecision, LLMProvider } from "@ao/shared";
import type { Ledger } from "../ledger/index.js";
import { runCheckpoint } from "./agent.js";
import { anySignalFired, type CheckpointSignals } from "./signals.js";
import { buildCheckpointStateSummary, type CheckpointStateSummaryInput } from "./summary.js";

/**
 * PROTOCOLS.md §6's three fixed points ("אחרי recon, אחרי השלב הראשון,
 * לפני סינתזה") — a documented, stable enum so callers (the Scheduler
 * integration, P9's UI) can't invent a fourth ad hoc mandatory point
 * without it being visible here.
 */
export type MandatoryCheckpointPoint = "after-recon" | "after-first-stage" | "before-synthesis";

export type CheckpointTriggerReason = "none" | "signal" | "mandatory";

export interface RunCheckpointGateParams {
  ledger: Ledger;
  provider: LLMProvider;
  model: string;
  stageId: string;
  signals: CheckpointSignals;
  /** Set for one of PROTOCOLS.md §6's three fixed points — forces the agent call even when every signal in `signals` is false. `undefined` for a normal mid-run stage boundary, where only a fired signal triggers the call. */
  mandatoryPoint?: MandatoryCheckpointPoint;
  /** Everything the state summary needs except `signals` (already supplied above and threaded through automatically, so the two can't drift apart). */
  summaryInput: Omit<CheckpointStateSummaryInput, "signals">;
  /** BUDGET.md §4.1's precomputed worst-case for the `checkpoint` agent call — only spent if the gate actually decides to call it. */
  worstCase: number;
  maxSummaryTokens?: number;
}

export interface CheckpointGateResult {
  decision: CheckpointDecision;
  /** False means the `checkpoint` agent was never invoked — zero tokens spent, structurally (P6-T1's own done-criterion). */
  calledAgent: boolean;
  triggerReason: CheckpointTriggerReason;
}

const CONTINUE_NO_SIGNAL_DECISION: CheckpointDecision = {
  decision: "continue",
  reason: "no local signal fired and this is not a mandatory checkpoint",
  patch: [],
  confidence: 1,
};

/**
 * Returns a `CheckpointDecision` plus whether the `checkpoint` agent was
 * actually invoked. `calledAgent: false` is the structural proof behind
 * P6-T1's own done-criterion ("יש בדיקה שסופרת קריאות ומאמתת 0") — a
 * caller's test can additionally assert `provider.calls.generate.length
 * === 0` for the same fact from the provider's own side.
 */
export async function runCheckpointGate(params: RunCheckpointGateParams): Promise<CheckpointGateResult> {
  const fired = anySignalFired(params.signals);
  const isMandatory = params.mandatoryPoint !== undefined;

  if (!fired && !isMandatory) {
    return { decision: CONTINUE_NO_SIGNAL_DECISION, calledAgent: false, triggerReason: "none" };
  }

  const { text: summary } = buildCheckpointStateSummary(
    { ...params.summaryInput, signals: params.signals },
    params.maxSummaryTokens,
  );

  const decision = await runCheckpoint({
    ledger: params.ledger,
    provider: params.provider,
    model: params.model,
    stageId: params.stageId,
    summary,
    worstCase: params.worstCase,
  });

  return { decision, calledAgent: true, triggerReason: fired ? "signal" : "mandatory" };
}
