import { describe, expect, it } from "vitest";
import type { Plan, Stage } from "@ao/shared";
import type { RunState } from "./run-state.js";
import { budgetSeverity, projectFinalTokens } from "./budget-projection.js";

function buildStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: "s1",
    name: "שלב",
    goal: "מטרה",
    dependsOn: [],
    agentType: "reader",
    fanout: { mode: "shard", count: 6, maxParallel: 3, shardKey: "module" },
    inputs: [{ from: "artifacts", select: "repoMap" }],
    outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { maxInputTokens: 30000, cacheContract: true },
    tokenBudget: { estimatedIn: 180000, estimatedOut: 20000, hardCap: 300000 },
    mergeStrategy: "local:dedupe-findings",
    successCriteria: ["ok"],
    onFailure: "degrade",
    optional: false,
    ...overrides,
  };
}

function buildPlan(stages: Stage[]): Plan {
  return {
    version: 1,
    runId: "run_test",
    objective: "x",
    deliverables: [{ id: "d1", kind: "data", target: "chat", acceptance: ["ok"] }],
    readPolicy: { maxRung: "R4", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages,
    reserve: { synthesisTokens: 120000, repairTokens: 60000 },
  };
}

function stageState(
  stageId: string,
  status: RunState["stages"][string]["status"],
): RunState["stages"][string] {
  return { stageId, status, taskCount: 1, tokensUsed: 0, criteriaMet: [] };
}

describe("budgetSeverity", () => {
  it("is 'ok' under 75%", () => {
    expect(budgetSeverity(700_000, 0, 1_000_000)).toBe("ok");
  });

  it("is 'warning' at or above 75%", () => {
    expect(budgetSeverity(750_000, 0, 1_000_000)).toBe("warning");
    expect(budgetSeverity(800_000, 0, 1_000_000)).toBe("warning");
  });

  it("is 'danger' at or above 90%", () => {
    expect(budgetSeverity(900_000, 0, 1_000_000)).toBe("danger");
    expect(budgetSeverity(950_000, 0, 1_000_000)).toBe("danger");
  });

  it("counts committed tokens toward the ratio, not just spent", () => {
    // 500K spent + 400K committed = 900K/1M = 90% -> danger, even though spent alone is only 50%.
    expect(budgetSeverity(500_000, 400_000, 1_000_000)).toBe("danger");
  });

  it("doesn't divide by zero for a zero total", () => {
    expect(budgetSeverity(0, 0, 0)).toBe("ok");
  });
});

describe("projectFinalTokens", () => {
  it("returns null with no plan loaded (today's real chat path — no scheduler yet)", () => {
    expect(projectFinalTokens(null, {}, 500_000)).toBeNull();
  });

  it("returns null when no stage has finished yet (nothing to calibrate against)", () => {
    const plan = buildPlan([buildStage({ id: "s1" })]);
    const stages = { s1: stageState("s1", "running") };
    expect(projectFinalTokens(plan, stages, 50_000)).toBeNull();
  });

  it("projects the plan total scaled by the actual/estimated ratio of finished stages", () => {
    // s1 estimated 200K (180K+20K), actually cost 400K -> ratio 2x.
    // Plan total estimated = 200K (s1) + 200K (s2, same shape) = 400K -> projected 800K.
    const plan = buildPlan([buildStage({ id: "s1" }), buildStage({ id: "s2" })]);
    const stages = { s1: stageState("s1", "done") };
    expect(projectFinalTokens(plan, stages, 400_000)).toBe(800_000);
  });

  it("an 'issue' or 'skipped' stage still counts as finished for calibration", () => {
    const plan = buildPlan([buildStage({ id: "s1" })]);
    expect(projectFinalTokens(plan, { s1: stageState("s1", "issue") }, 100_000)).not.toBeNull();
    expect(projectFinalTokens(plan, { s1: stageState("s1", "skipped") }, 100_000)).not.toBeNull();
  });

  it("a 'pending' stage doesn't count toward the calibration base", () => {
    const plan = buildPlan([buildStage({ id: "s1" }), buildStage({ id: "s2" })]);
    // Only s1 finished; s2 is still pending and must not be included in estimatedSoFar.
    const stages = { s1: stageState("s1", "done") };
    // Same math as the ratio test above, proving s2 (pending) wasn't folded into the "so far" estimate.
    expect(projectFinalTokens(plan, stages, 200_000)).toBe(400_000);
  });
});
