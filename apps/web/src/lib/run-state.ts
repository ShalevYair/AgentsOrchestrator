import { applyJsonPatch } from "@ao/core/checkpoint";
import { PlanSchema, type NdjsonEnvelope, type Plan, type RuntimeEvent, type Usage } from "@ao/shared";

export interface PlanAmendment {
  version: number;
  reason: string;
  diff: string;
}

/**
 * UX.md §5's icon vocabulary (⏳/✅/⚠️/⏭️) applies identically to both the
 * stage row (level 1) and the task row (level 2) — one shared status type
 * instead of two near-identical ones. `pending`/`skipped` only really
 * apply to stages in practice (a task only starts existing once
 * `task.started` fires), but sharing the type keeps both levels reading
 * the same "what does this icon mean" logic.
 */
export type ProgressStatus = "pending" | "running" | "done" | "issue" | "skipped";

export interface StageState {
  stageId: string;
  status: ProgressStatus;
  taskCount: number;
  tokensUsed: number;
  criteriaMet: string[];
}

export interface TaskState {
  taskId: string;
  stageId: string;
  agentType: string;
  shard: string;
  status: ProgressStatus;
  contextTokens: number;
  /** Client-observed wall-clock timestamps (ms since epoch) — PROTOCOLS.md §9's envelope carries no server timestamp, so "how long did this take" is measured from when this browser saw the events, not authoritative server timing. */
  startedAt: number;
  finishedAt: number | null;
  usage: Usage | null;
  finishReason: string | null;
  violations: number | null;
  /** Accumulated task.delta envelopes, in arrival order — level 3's (P9-T5) streaming output. Level 1/2 never read this, so a fast stream of deltas only ever touches this one task's entry, not the rest of the board (see the reducer's immutable-per-task update below). */
  deltas: NdjsonEnvelope[];
}

export interface RunState {
  runId: string | null;
  status: "idle" | "running" | "completed" | "failed";
  plan: Plan | null;
  estimatedTokens: number | null;
  requiresApproval: boolean;
  /** The most recent `plan.amended` — UX.md §4's "⚠️ vN: ... [דיף]" banner shows only the latest change, not a full history. */
  amendment: PlanAmendment | null;
  stages: Record<string, StageState>;
  /** Stage ids in first-seen order — Records don't guarantee iteration order is meaningful once entries are replaced, so render order is tracked explicitly. */
  stageOrder: string[];
  tasks: Record<string, TaskState>;
  tasksByStage: Record<string, string[]>;
  /**
   * The stage currently between `stage.started` and `stage.finished`.
   * `task.started` carries no `stageId` (PROTOCOLS.md §9's payload is
   * `{taskId, agentType, shard, contextTokens}`) — attributing every task
   * event to this instead is sound, not a guess: P5-T4's scheduler runs
   * stages strictly one-after-another (never two stages' tasks
   * interleaved), only fanning out *within* a stage, so "whichever stage
   * most recently started and hasn't finished yet" is unambiguous.
   */
  currentStageId: string | null;
}

export const INITIAL_RUN_STATE: RunState = {
  runId: null,
  status: "idle",
  plan: null,
  estimatedTokens: null,
  requiresApproval: false,
  amendment: null,
  stages: {},
  stageOrder: [],
  tasks: {},
  tasksByStage: {},
  currentStageId: null,
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
 * `stage.finished` carries `criteriaMet` but no explicit outcome field —
 * derived against the plan's own declared `successCriteria` for that
 * stage (when the plan is loaded) rather than guessing at a new signal:
 * every declared criterion present -> done; some but not all -> issue; a
 * stage that ran but produced zero tasks -> skipped (the closest reading
 * of "this stage didn't do anything" available from existing fields,
 * documented here rather than silently assumed).
 */
function deriveStageStatus(
  plan: Plan | null,
  stageId: string,
  taskCount: number,
  criteriaMet: string[],
): ProgressStatus {
  if (taskCount === 0) return "skipped";
  const declared = plan?.stages.find((s) => s.id === stageId)?.successCriteria;
  if (!declared || declared.length === 0) return criteriaMet.length > 0 ? "done" : "issue";
  return declared.every((c) => criteriaMet.includes(c)) ? "done" : "issue";
}

function deriveTaskStatus(finishReason: string, violations: number): ProgressStatus {
  return finishReason === "stop" && violations === 0 ? "done" : "issue";
}

/** Replaces one entry in a Record by id, leaving every other entry's object reference untouched — the point isn't tidiness, it's that React.memo'd row components (P9-T4/T5) can skip re-rendering the 19 other rows when only one task's data changed. */
function withEntry<T>(record: Record<string, T>, id: string, next: T): Record<string, T> {
  return { ...record, [id]: next };
}

/**
 * Pure fold over the WebSocket event stream (PROTOCOLS.md §9) into
 * everything the plan card (P9-T2), plan editing (P9-T3), the
 * orchestration board (P9-T4), the transparent box (P9-T5), and the
 * budget meter (P9-T6) need to render. One reducer shared across those —
 * not one per component — so there's a single place that knows how to
 * read each event, and every component sees the same state.
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

    case "stage.started": {
      const { stageId, taskCount, tokensUsed, criteriaMet } = event.payload;
      const alreadyOrdered = state.stageOrder.includes(stageId);
      return {
        ...state,
        stages: withEntry(state.stages, stageId, {
          stageId,
          status: "running",
          taskCount,
          tokensUsed,
          criteriaMet,
        }),
        stageOrder: alreadyOrdered ? state.stageOrder : [...state.stageOrder, stageId],
        currentStageId: stageId,
      };
    }

    case "stage.finished": {
      const { stageId, taskCount, tokensUsed, criteriaMet } = event.payload;
      const status = deriveStageStatus(state.plan, stageId, taskCount, criteriaMet);
      return {
        ...state,
        stages: withEntry(state.stages, stageId, { stageId, status, taskCount, tokensUsed, criteriaMet }),
        currentStageId: state.currentStageId === stageId ? null : state.currentStageId,
      };
    }

    case "task.started": {
      const { taskId, agentType, shard, contextTokens } = event.payload;
      const stageId = state.currentStageId ?? "";
      const existingForStage = state.tasksByStage[stageId] ?? [];
      return {
        ...state,
        tasks: withEntry(state.tasks, taskId, {
          taskId,
          stageId,
          agentType,
          shard,
          status: "running",
          contextTokens,
          startedAt: Date.now(),
          finishedAt: null,
          usage: null,
          finishReason: null,
          violations: null,
          deltas: [],
        }),
        tasksByStage: existingForStage.includes(taskId)
          ? state.tasksByStage
          : { ...state.tasksByStage, [stageId]: [...existingForStage, taskId] },
      };
    }

    case "task.delta": {
      const { taskId, envelope } = event.payload;
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        ...state,
        tasks: withEntry(state.tasks, taskId, { ...task, deltas: [...task.deltas, envelope] }),
      };
    }

    case "task.finished": {
      const { taskId, usage, finishReason, violations } = event.payload;
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        ...state,
        tasks: withEntry(state.tasks, taskId, {
          ...task,
          status: deriveTaskStatus(finishReason, violations),
          finishedAt: Date.now(),
          usage,
          finishReason,
          violations,
        }),
      };
    }

    case "run.finished":
      return { ...state, status: event.payload.status === "completed" ? "completed" : "failed" };

    default:
      return state;
  }
}
