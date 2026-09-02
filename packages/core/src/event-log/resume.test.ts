import type { RuntimeEvent } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { EventLog } from "./log.js";
import { computeResumePoint } from "./resume.js";

function stageStarted(stageId: string): RuntimeEvent {
  return {
    type: "stage.started",
    runId: "run_placeholder",
    seq: -1,
    payload: { stageId, taskCount: 1, tokensUsed: 0, criteriaMet: [] },
  };
}

function stageFinished(stageId: string): RuntimeEvent {
  return {
    type: "stage.finished",
    runId: "run_placeholder",
    seq: -1,
    payload: { stageId, taskCount: 1, tokensUsed: 100, criteriaMet: ["c1"] },
  };
}

describe("computeResumePoint", () => {
  it("resumes from the first stage with no stage.finished event", () => {
    const events: RuntimeEvent[] = [stageStarted("s1"), stageFinished("s1"), stageStarted("s2")];
    const point = computeResumePoint(events, ["s1", "s2", "s3"]);
    expect(point.completedStageIds).toEqual(["s1"]);
    expect(point.resumeFromStageId).toBe("s2");
  });

  it("reports null once every stage has finished", () => {
    const events: RuntimeEvent[] = [stageFinished("s1"), stageFinished("s2")];
    const point = computeResumePoint(events, ["s1", "s2"]);
    expect(point.resumeFromStageId).toBeNull();
    expect(point.completedStageIds).toEqual(["s1", "s2"]);
  });

  it("resumes from stage 1 given no events at all", () => {
    const point = computeResumePoint([], ["s1", "s2", "s3"]);
    expect(point.resumeFromStageId).toBe("s1");
    expect(point.completedStageIds).toEqual([]);
  });
});

describe("P5-T12's own done-criterion — killing the process mid-stage-3 resumes from stage 3, not stage 1", () => {
  it("reconstructs the correct resume point from a serialized-and-restored event log", () => {
    const log = new EventLog("run_crashtest");
    log.append(stageStarted("s1"));
    log.append(stageFinished("s1"));
    log.append(stageStarted("s2"));
    log.append(stageFinished("s2"));
    log.append(stageStarted("s3"));
    // The process is killed here — no stage.finished for s3 was ever written.

    const eventsJsonl = log.serialize();

    // Simulate the restart: a fresh process reads events.jsonl back in.
    const restoredLog = EventLog.fromSerialized("run_crashtest", eventsJsonl);
    const point = computeResumePoint(restoredLog.all(), ["s1", "s2", "s3", "s4"]);

    expect(point.completedStageIds).toEqual(["s1", "s2"]);
    expect(point.resumeFromStageId).toBe("s3"); // not s1 — s1/s2 are never re-run
  });
});
