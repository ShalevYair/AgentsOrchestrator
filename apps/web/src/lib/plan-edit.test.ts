import { describe, expect, it } from "vitest";
import type { Plan, Stage } from "@ao/shared";
import {
  removeOptionalStage,
  scaleStageCount,
  setMaxRung,
  setStageMaxParallel,
  sumPlanAgents,
  sumPlanEstimatedTokens,
} from "./plan-edit.js";

function buildStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: "s1",
    name: "מיפוי מבנה",
    goal: "לזהות מודולים",
    dependsOn: [],
    agentType: "reader",
    fanout: { mode: "shard", count: 6, maxParallel: 3, shardKey: "module" },
    inputs: [{ from: "artifacts", select: "repoMap" }],
    outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { maxInputTokens: 30000, cacheContract: true },
    tokenBudget: { estimatedIn: 180000, estimatedOut: 48000, hardCap: 300000 },
    mergeStrategy: "local:dedupe-findings",
    successCriteria: ["לפחות ממצא אחד"],
    onFailure: "degrade",
    optional: false,
    ...overrides,
  };
}

function buildPlan(stages: Stage[]): Plan {
  return {
    version: 1,
    runId: "run_test123",
    objective: "ניתוח",
    deliverables: [{ id: "d1", kind: "data", target: "chat", acceptance: ["ok"] }],
    readPolicy: { maxRung: "R4", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages,
    reserve: { synthesisTokens: 120000, repairTokens: 60000 },
  };
}

describe("scaleStageCount", () => {
  it("scales estimatedIn/estimatedOut/hardCap proportionally", () => {
    const scaled = scaleStageCount(buildStage(), 3); // 6 -> 3, half
    expect(scaled.fanout.count).toBe(3);
    expect(scaled.tokenBudget.estimatedIn).toBe(90000);
    expect(scaled.tokenBudget.estimatedOut).toBe(24000);
    expect(scaled.tokenBudget.hardCap).toBe(150000);
  });

  it("clamps maxParallel down to the new count when it would otherwise exceed it", () => {
    const scaled = scaleStageCount(
      buildStage({ fanout: { mode: "shard", count: 6, maxParallel: 6, shardKey: "module" } }),
      2,
    );
    expect(scaled.fanout.maxParallel).toBe(2);
  });

  it("leaves an already-lower maxParallel untouched", () => {
    const scaled = scaleStageCount(
      buildStage({ fanout: { mode: "shard", count: 6, maxParallel: 2, shardKey: "module" } }),
      4,
    );
    expect(scaled.fanout.maxParallel).toBe(2);
  });

  it("is a no-op (same reference) when the count doesn't actually change", () => {
    const stage = buildStage();
    expect(scaleStageCount(stage, 6)).toBe(stage);
  });
});

describe("setStageMaxParallel", () => {
  it("updates only maxParallel", () => {
    const stage = buildStage();
    const next = setStageMaxParallel(stage, 5);
    expect(next.fanout.maxParallel).toBe(5);
    expect(next.fanout.count).toBe(6);
    expect(next.tokenBudget).toEqual(stage.tokenBudget);
  });
});

describe("removeOptionalStage", () => {
  it("removes a stage marked optional", () => {
    const plan = buildPlan([buildStage(), buildStage({ id: "s2", optional: true, dependsOn: ["s1"] })]);
    const next = removeOptionalStage(plan, "s2");
    expect(next.stages).toHaveLength(1);
    expect(next.stages[0]?.id).toBe("s1");
  });

  it("refuses to remove a non-optional stage (returns the plan unchanged)", () => {
    const plan = buildPlan([buildStage({ optional: false })]);
    const next = removeOptionalStage(plan, "s1");
    expect(next).toBe(plan);
  });

  it("strips the removed id from other stages' dependsOn", () => {
    const plan = buildPlan([
      buildStage({ id: "s1", optional: true }),
      buildStage({ id: "s2", dependsOn: ["s1"], inputs: [{ from: "artifacts", select: "x" }] }),
    ]);
    const next = removeOptionalStage(plan, "s1");
    expect(next.stages).toHaveLength(1);
    expect(next.stages[0]?.dependsOn).toEqual([]);
  });

  it("ignores an unknown stage id", () => {
    const plan = buildPlan([buildStage()]);
    expect(removeOptionalStage(plan, "does-not-exist")).toBe(plan);
  });
});

describe("setMaxRung", () => {
  it("updates readPolicy.maxRung", () => {
    const plan = buildPlan([buildStage()]);
    expect(setMaxRung(plan, "R2").readPolicy.maxRung).toBe("R2");
  });
});

describe("sumPlanEstimatedTokens / sumPlanAgents", () => {
  it("sums across all stages", () => {
    const plan = buildPlan([
      buildStage({ id: "s1", tokenBudget: { estimatedIn: 100, estimatedOut: 20, hardCap: 1000 } }),
      buildStage({
        id: "s2",
        fanout: { mode: "single", count: 1, maxParallel: 1 },
        tokenBudget: { estimatedIn: 50, estimatedOut: 10, hardCap: 500 },
      }),
    ]);
    expect(sumPlanEstimatedTokens(plan)).toBe(180); // 100+20+50+10
    expect(sumPlanAgents(plan)).toBe(7); // 6 + 1
  });
});
