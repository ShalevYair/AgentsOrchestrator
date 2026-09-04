import { describe, expect, it } from "vitest";
import type { Plan, Stage } from "@ao/shared";
import { scaleStageCount, replaceStage } from "./plan-edit.js";
import { validateEditedPlan } from "./plan-validation.js";

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

describe("validateEditedPlan", () => {
  it("accepts a plan comfortably within budget", () => {
    const plan = buildPlan([buildStage()]);
    const result = validateEditedPlan(plan, 2_500_000, "standard");
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects (V2) a plan whose stages' hardCaps + reserve exceed the budget — the real overrun check, not a UI-side guess", () => {
    const plan = buildPlan([
      buildStage({ tokenBudget: { estimatedIn: 180000, estimatedOut: 48000, hardCap: 5_000_000 } }),
    ]);
    const result = validateEditedPlan(plan, 1_000_000, "standard");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "V2")).toBe(true);
  });

  it("scaling a stage up until it overruns the budget is caught by the same real validator", () => {
    const plan = buildPlan([buildStage()]);
    // Scale 6 -> 600: hardCap scales proportionally from 300K to 30M, which no reasonable budget covers.
    const scaled = replaceStage(plan, "s1", scaleStageCount(plan.stages[0]!, 600));
    const result = validateEditedPlan(scaled, 2_500_000, "standard");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "V2")).toBe(true);
  });

  it("rejects (V6) a fanout.count/maxParallel above the level's ceiling", () => {
    // "draft" caps maxParallel at 3 (BUDGET.md §1) — 5 exceeds it.
    const plan = buildPlan([
      buildStage({ fanout: { mode: "shard", count: 5, maxParallel: 5, shardKey: "module" } }),
    ]);
    const result = validateEditedPlan(plan, 500_000, "draft");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "V6")).toBe(true);
  });

  it("rejects (V8) a maxRung above the level's ceiling", () => {
    // "draft" caps maxRung at R4 (BUDGET.md §1) — R5 exceeds it.
    const plan = buildPlan([buildStage()]);
    const r5Plan: Plan = { ...plan, readPolicy: { ...plan.readPolicy, maxRung: "R5" } };
    const result = validateEditedPlan(r5Plan, 500_000, "draft");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "V8")).toBe(true);
  });
});
