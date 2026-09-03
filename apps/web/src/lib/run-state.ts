import { applyJsonPatch } from "@ao/core/checkpoint";
import { PlanSchema, type Plan, type RuntimeEvent } from "@ao/shared";

export interface PlanAmendment {
  version: number;
  reason: string;
  diff: string;
}

export interface RunState {
  runId: string | null;
  status: "idle" | "running" | "completed" | "failed";
  plan: Plan | null;
  estimatedTokens: number | null;
  requiresApproval: boolean;
  /** The most recent `plan.amended` — UX.md §4's "⚠️ vN: ... [דיף]" banner shows only the latest change, not a full history. */
  amendment: PlanAmendment | null;
}

export const INITIAL_RUN_STATE: RunState = {
  runId: null,
  status: "idle",
  plan: null,
  estimatedTokens: null,
  requiresApproval: false,
  amendment: null,
};

/**
 * Reconstructs the amended `Plan` by applying the event's JSON Patch to the
 * current one — `plan.amended` (PROTOCOLS.md §9) carries the patch, not a
 * fresh whole document, so this is how "the card updates itself in place"
 * (UX.md §4) actually gets its new data. The patch already went through
 * `packages/core`'s allowlist + `validatePlan` server-side before this
 * event was ever published, so re-applying it here is expected to always
 * succeed — but a WS event is untrusted-enough input that this still never
 * throws: on any failure (or if there's no current plan to patch at all,
 * which shouldn't happen but isn't this function's job to assume away) the
 * previous plan is kept as-is rather than corrupting the card.
 */
function applyAmendment(
  currentPlan: Plan | null,
  patch: RuntimeEvent & { type: "plan.amended" },
): Plan | null {
  if (!currentPlan) return currentPlan;
  try {
    const patched = applyJsonPatch(currentPlan, patch.payload.patch);
    const result = PlanSchema.safeParse(patched);
    return result.success ? result.data : currentPlan;
  } catch {
    return currentPlan;
  }
}

/**
 * Pure fold over the WebSocket event stream (PROTOCOLS.md §9) into
 * everything the plan card (P9-T2), and later the orchestration board /
 * budget meter, need to render. One reducer shared across those — not one
 * per component — so there's a single place that knows how to read each
 * event, and every component sees the same state.
 */
export function applyRuntimeEvent(state: RunState, event: RuntimeEvent): RunState {
  switch (event.type) {
    case "run.started":
      return { ...INITIAL_RUN_STATE, runId: event.runId, status: "running" };
    case "plan.ready":
      return {
        ...state,
        plan: event.payload.plan,
        estimatedTokens: event.payload.estimatedTokens,
        requiresApproval: event.payload.requiresApproval,
        amendment: null,
      };
    case "plan.amended":
      return {
        ...state,
        plan: applyAmendment(state.plan, event),
        amendment: { version: event.payload.version, reason: event.payload.reason, diff: event.payload.diff },
      };
    case "run.finished":
      return { ...state, status: event.payload.status === "completed" ? "completed" : "failed" };
    default:
      return state;
  }
}
