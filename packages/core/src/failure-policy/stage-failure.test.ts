import type { Stage } from "@ao/shared";
import { describe, expect, it } from "vitest";
import type { StageRunResult } from "../scheduler/index.js";
import { applyStageFailurePolicy } from "./stage-failure.js";

function stageDescriptor(onFailure: Stage["onFailure"]): Pick<Stage, "id" | "onFailure"> {
  return { id: "s1", onFailure };
}

function resultWithOneFailure(): StageRunResult<string> {
  return {
    stageId: "s1",
    outcomes: [
      { taskId: "s1#0", status: "success", value: "ok" },
      { taskId: "s1#1", status: "failed", error: new Error("simulated failure") },
    ],
  };
}

describe("applyStageFailurePolicy — no failures", () => {
  it("always proceeds with everything, regardless of policy", () => {
    const result: StageRunResult<string> = {
      stageId: "s1",
      outcomes: [{ taskId: "s1#0", status: "success", value: "ok" }],
    };
    for (const policy of ["retry", "degrade", "replan", "skip"] as const) {
      const decision = applyStageFailurePolicy(stageDescriptor(policy), result);
      expect(decision).toEqual({ decision: "proceed", outcomes: result.outcomes, gaps: [] });
    }
  });
});

describe("applyStageFailurePolicy — retry", () => {
  it("asks the caller to retry the whole stage on a simulated failure", () => {
    const decision = applyStageFailurePolicy(stageDescriptor("retry"), resultWithOneFailure());
    expect(decision).toEqual({ decision: "retry-stage" });
  });
});

describe("applyStageFailurePolicy — degrade", () => {
  it("keeps successful outcomes and turns each failure into a Gap", () => {
    const decision = applyStageFailurePolicy(stageDescriptor("degrade"), resultWithOneFailure());
    expect(decision.decision).toBe("proceed");
    if (decision.decision !== "proceed") return;
    expect(decision.outcomes).toEqual([{ taskId: "s1#0", status: "success", value: "ok" }]);
    expect(decision.gaps).toHaveLength(1);
    expect(decision.gaps[0]?.reason).toContain("simulated failure");
    expect(decision.gaps[0]?.stageId).toBe("s1");
  });
});

describe("applyStageFailurePolicy — skip", () => {
  it("discards the entire stage's output, even successful tasks, and records one gap", () => {
    const decision = applyStageFailurePolicy(stageDescriptor("skip"), resultWithOneFailure());
    expect(decision.decision).toBe("proceed");
    if (decision.decision !== "proceed") return;
    expect(decision.outcomes).toHaveLength(0); // the successful task's output is dropped too
    expect(decision.gaps).toHaveLength(1);
    expect(decision.gaps[0]?.description).toContain("skipped entirely");
  });
});

describe("applyStageFailurePolicy — replan", () => {
  it("signals that the plan can't continue past this stage as-is", () => {
    const decision = applyStageFailurePolicy(stageDescriptor("replan"), resultWithOneFailure());
    expect(decision.decision).toBe("replan");
    if (decision.decision !== "replan") return;
    expect(decision.reason).toContain("s1");
  });
});
