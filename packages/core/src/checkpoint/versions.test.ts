import { describe, expect, it } from "vitest";
import type { JsonPatchOperation, Plan, Stage } from "@ao/shared";
import { applyPlanPatch } from "./patch.js";
import { planVersionFileName, PlanVersionHistory, serializePlanVersion } from "./versions.js";
import type { PlanValidationContext } from "../plan/index.js";

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

function buildPlan(): Plan {
  return {
    version: 1,
    runId: "run_test123",
    objective: "analyze",
    deliverables: [{ id: "d1", kind: "data", target: "chat", acceptance: ["ok"] }],
    readPolicy: { maxRung: "R2", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages: [buildStage()],
    reserve: { synthesisTokens: 50000, repairTokens: 50000 },
  };
}

function buildContext(): PlanValidationContext {
  return {
    budgetTotal: 1_000_000,
    budgetLevel: "standard",
    knownAgentTypes: new Set(["reader"]),
    modelMaxOutputTokens: 64_000,
  };
}

describe("planVersionFileName / serializePlanVersion", () => {
  it("names files plan.vN.json", () => {
    expect(planVersionFileName(1)).toBe("plan.v1.json");
    expect(planVersionFileName(7)).toBe("plan.v7.json");
  });

  it("serializes the plan document as pretty JSON", () => {
    const plan = buildPlan();
    const text = serializePlanVersion({ version: 1, plan, patch: [], reason: "initial plan", diff: "x" });
    expect(JSON.parse(text)).toEqual(plan);
  });
});

describe("PlanVersionHistory", () => {
  it("starts with just the initial plan as version 1", () => {
    const plan = buildPlan();
    const history = new PlanVersionHistory(plan);
    expect(history.current()).toBe(plan);
    expect(history.versions()).toHaveLength(1);
    expect(history.versions()[0]?.version).toBe(1);
  });

  it("records every applied amendment as a new, readable-diff version", () => {
    const plan = buildPlan();
    const history = new PlanVersionHistory(plan);
    const patch: JsonPatchOperation[] = [{ op: "replace", path: "/stages/0/fanout/count", value: 3 }];
    const applied = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(applied.status).toBe("applied");
    if (applied.status !== "applied") return;

    const entry = history.recordAmendment(applied.plan, patch, "input larger than expected");
    expect(entry.version).toBe(2);
    expect(entry.diff).toContain("replace /stages/0/fanout/count: 6 → 3");
    expect(history.current()).toBe(applied.plan);
    expect(history.versions()).toHaveLength(2);
  });

  it("chains multiple amendments, each diffing against its immediate predecessor", () => {
    const plan = buildPlan();
    const history = new PlanVersionHistory(plan);
    const ctx = buildContext();

    const patch1: JsonPatchOperation[] = [{ op: "replace", path: "/stages/0/fanout/count", value: 3 }];
    const applied1 = applyPlanPatch({
      plan: history.current(),
      patch: patch1,
      completedStageIds: [],
      validationContext: ctx,
    });
    if (applied1.status !== "applied") throw new Error("expected applied");
    history.recordAmendment(applied1.plan, patch1, "first amendment");

    const patch2: JsonPatchOperation[] = [{ op: "replace", path: "/stages/0/fanout/maxParallel", value: 3 }];
    const applied2 = applyPlanPatch({
      plan: history.current(),
      patch: patch2,
      completedStageIds: [],
      validationContext: ctx,
    });
    if (applied2.status !== "applied") throw new Error("expected applied");
    const entry2 = history.recordAmendment(applied2.plan, patch2, "second amendment");

    expect(entry2.version).toBe(3);
    expect(entry2.diff).toBe("replace /stages/0/fanout/maxParallel: 6 → 3");
    expect(history.versions().map((v) => v.version)).toEqual([1, 2, 3]);
  });
});
