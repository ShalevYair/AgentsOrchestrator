import { describe, expect, it } from "vitest";
import type { JsonPatchOperation, Plan, Stage } from "@ao/shared";
import { diffPlanStages, formatPlanDiff } from "./diff.js";

function buildStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: "s1",
    name: "map structure",
    goal: "identify modules",
    dependsOn: [],
    agentType: "reader",
    fanout: { mode: "shard", count: 6, maxParallel: 6, shardKey: "module" },
    inputs: [{ from: "artifacts", select: "repoMap" }],
    outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { maxInputTokens: 30000, cacheContract: true },
    tokenBudget: { estimatedIn: 180000, estimatedOut: 24000, hardCap: 100000 },
    mergeStrategy: "local:dedupe-findings",
    successCriteria: ["at least one finding"],
    onFailure: "degrade",
    optional: false,
    ...overrides,
  };
}

function buildPlan(stages: Stage[], version = 1): Plan {
  return {
    version,
    runId: "run_test123",
    objective: "analyze",
    deliverables: [{ id: "d1", kind: "data", target: "chat", acceptance: ["ok"] }],
    readPolicy: { maxRung: "R2", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages,
    reserve: { synthesisTokens: 50000, repairTokens: 50000 },
  };
}

describe("formatPlanDiff", () => {
  it("returns a placeholder for an empty patch", () => {
    expect(formatPlanDiff([], buildPlan([buildStage()]))).toBe("(no changes)");
  });

  it("shows old → new for a replace against the previous plan", () => {
    const plan = buildPlan([buildStage()]);
    const patch: JsonPatchOperation[] = [{ op: "replace", path: "/stages/0/fanout/count", value: 3 }];
    expect(formatPlanDiff(patch, plan)).toBe("replace /stages/0/fanout/count: 6 → 3");
  });

  it("formats add/remove/move/copy/test readably", () => {
    const plan = buildPlan([buildStage()]);
    const patch: JsonPatchOperation[] = [
      { op: "add", path: "/stages/1", value: { id: "s2" } },
      { op: "remove", path: "/stages/0/fanout/shardKey" },
      { op: "move", from: "/a", path: "/b" },
      { op: "copy", from: "/a", path: "/c" },
      { op: "test", path: "/version", value: 1 },
    ];
    const text = formatPlanDiff(patch, plan);
    expect(text).toContain('add /stages/1 = {"id":"s2"}');
    expect(text).toContain('remove /stages/0/fanout/shardKey (was: "module")');
    expect(text).toContain("move /a → /b");
    expect(text).toContain("copy /a → /c");
    expect(text).toContain("test /version == 1");
  });
});

describe("diffPlanStages", () => {
  it("reports no stage-level changes for identical plans", () => {
    const plan = buildPlan([buildStage()]);
    expect(diffPlanStages(plan, plan)).toBe("(no stage-level changes)");
  });

  it("reports added and removed stages", () => {
    const oldPlan = buildPlan([buildStage({ id: "s1" }), buildStage({ id: "s2", name: "second" })]);
    const newPlan = buildPlan([buildStage({ id: "s1" }), buildStage({ id: "s3", name: "third" })]);
    const text = diffPlanStages(oldPlan, newPlan);
    expect(text).toContain('+ stage "s3"');
    expect(text).toContain('- stage "s2"');
  });

  it("reports agentType, fanout, and hardCap changes for a stage present in both", () => {
    const oldPlan = buildPlan([buildStage()]);
    const newPlan = buildPlan([
      buildStage({
        agentType: "analyst",
        fanout: { mode: "single", count: 1, maxParallel: 1 },
        tokenBudget: { estimatedIn: 1, estimatedOut: 1, hardCap: 50000 },
      }),
    ]);
    const text = diffPlanStages(oldPlan, newPlan);
    expect(text).toContain("agentType: reader → analyst");
    expect(text).toContain("fanout: shard/6/6 → single/1/1");
    expect(text).toContain("hardCap: 100000 → 50000");
  });
});
