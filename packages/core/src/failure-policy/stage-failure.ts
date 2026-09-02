import type { Gap, Stage } from "@ao/shared";
import type { StageRunResult, TaskOutcome } from "../scheduler/index.js";

export interface StageFailureProceed<T> {
  decision: "proceed";
  outcomes: TaskOutcome<T>[];
  gaps: Gap[];
}

export interface StageFailureRetry {
  decision: "retry-stage";
}

export interface StageFailureReplan {
  decision: "replan";
  reason: string;
}

export type StageFailureDecision<T> = StageFailureProceed<T> | StageFailureRetry | StageFailureReplan;

function describeFailure(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "unknown failure";
}

/**
 * P5-T11 — applies ARCHITECTURE.md §10's Stage-level policy
 * (`Stage.onFailure`) against one Stage's actual `StageRunResult` (from the
 * Scheduler, P5-T4). A Stage with no failed Tasks always just proceeds with
 * everything, regardless of policy — these four branches only matter once
 * something actually failed:
 *
 * - `"retry"` — asks the caller to re-run the Stage (this function performs
 *   no I/O itself; re-invoking the Scheduler for this stage is the
 *   caller's job).
 * - `"degrade"` — keeps every successful Task's output and turns each
 *   failure into a `Gap`, so the Stage still contributes whatever did work.
 * - `"skip"` — discards the *entire* Stage's output, even Tasks that
 *   succeeded, and records one Gap noting the whole Stage was dropped —
 *   this is a stronger response than `"degrade"`, matching the word: the
 *   Stage as a unit is skipped, not thinned out.
 * - `"replan"` — signals that the current Plan shape can't continue past
 *   this Stage as-is. Actually rebuilding the Plan around it is P6's
 *   adaptive replanning; this function only raises the signal.
 */
export function applyStageFailurePolicy<T>(
  stage: Pick<Stage, "id" | "onFailure">,
  result: StageRunResult<T>,
): StageFailureDecision<T> {
  const failed = result.outcomes.filter((o) => o.status !== "success");
  if (failed.length === 0) {
    return { decision: "proceed", outcomes: result.outcomes, gaps: [] };
  }

  switch (stage.onFailure) {
    case "retry":
      return { decision: "retry-stage" };
    case "replan":
      return {
        decision: "replan",
        reason: `stage "${stage.id}" has ${String(failed.length)} failed task(s) and its onFailure policy is "replan"`,
      };
    case "skip":
      return {
        decision: "proceed",
        outcomes: [],
        gaps: [
          {
            description: `stage "${stage.id}" was skipped entirely`,
            reason: `${String(failed.length)} of ${String(result.outcomes.length)} task(s) failed and the stage's onFailure policy is "skip"`,
            stageId: stage.id,
          },
        ],
      };
    case "degrade": {
      const succeeded = result.outcomes.filter((o) => o.status === "success");
      const gaps: Gap[] = failed.map((f) => ({
        description: `task "${f.taskId}" in stage "${stage.id}" did not complete (${f.status})`,
        reason: describeFailure(f.error),
        stageId: stage.id,
      }));
      return { decision: "proceed", outcomes: succeeded, gaps };
    }
    default: {
      const exhaustive: never = stage.onFailure;
      return exhaustive;
    }
  }
}
