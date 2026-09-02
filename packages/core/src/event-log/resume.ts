import type { RuntimeEvent } from "@ao/shared";

export interface ResumePoint {
  /** Stage ids (in `stageOrder`'s order) that already have a `stage.finished` event — must not be re-run. */
  completedStageIds: string[];
  /** The first stage in `stageOrder` with no `stage.finished` event yet — `null` once every stage has finished. A stage that has a `stage.started` but no `stage.finished` (the crash-mid-stage case) is exactly this: not in `completedStageIds`, so it's re-run from scratch rather than assumed partially done. */
  resumeFromStageId: string | null;
}

/**
 * P5-T12's actual resume decision (ADR-008 / this task's own done-
 * criterion: "הרג התהליך באמצע שלב 3 — הפעלה מחדש ממשיכה מ-3, לא מ-1").
 * Pure and synchronous — `events` is whatever `EventLog.fromSerialized`
 * (or `.all()` on a live log) produced; `stageOrder` is the Plan's own
 * topological order (`topologicalStageOrder`, P5-T4), so the two together
 * are everything needed to know where a restarted run should pick up.
 */
export function computeResumePoint(
  events: readonly RuntimeEvent[],
  stageOrder: readonly string[],
): ResumePoint {
  const completed = new Set<string>();
  for (const event of events) {
    if (event.type === "stage.finished") completed.add(event.payload.stageId);
  }
  const completedStageIds = stageOrder.filter((id) => completed.has(id));
  const resumeFromStageId = stageOrder.find((id) => !completed.has(id)) ?? null;
  return { completedStageIds, resumeFromStageId };
}
