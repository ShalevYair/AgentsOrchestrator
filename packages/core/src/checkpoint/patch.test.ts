import { describe, expect, it } from "vitest";
import type { JsonPatchOperation, Plan, Stage } from "@ao/shared";
import type { PlanValidationContext } from "../plan/index.js";
import { applyPlanPatch, applyPlanPatchOrThrow } from "./patch.js";

function buildStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: "s1",
    name: "map structure",
    goal: "identify modules and boundaries",
    dependsOn: [],
    agentType: "reader",
    fanout: { mode: "shard", count: 6, maxParallel: 6, shardKey: "module" },
    inputs: [{ from: "artifacts", select: "repoMap" }],
    outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { maxInputTokens: 30000, cacheContract: true },
    tokenBudget: { estimatedIn: 180000, estimatedOut: 24000, hardCap: 100000 },
    mergeStrategy: "local:dedupe-findings",
    successCriteria: ["at least one finding per module"],
    onFailure: "degrade",
    optional: false,
    ...overrides,
  };
}

function buildPlan(stages: Stage[] = [buildStage()]): Plan {
  return {
    version: 1,
    runId: "run_test123",
    objective: "analyze the repo and write an architecture document",
    deliverables: [{ id: "d1", kind: "data", target: "chat", acceptance: ["covers core packages"] }],
    readPolicy: { maxRung: "R2", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages,
    reserve: { synthesisTokens: 50000, repairTokens: 50000 },
  };
}

function buildContext(overrides: Partial<PlanValidationContext> = {}): PlanValidationContext {
  return {
    budgetTotal: 1_000_000,
    budgetLevel: "standard",
    knownAgentTypes: new Set(["reader", "writer", "planner", "recon"]),
    modelMaxOutputTokens: 64_000,
    ...overrides,
  };
}

describe("applyPlanPatch — path allowlist", () => {
  it("rejects a patch attempting to touch a path with no budget.total field at all, changing nothing", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [{ op: "replace", path: "/budget/total", value: 999_999_999 }];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("rejected");
    expect(result.plan).toBe(plan);
    if (result.status === "rejected") {
      expect(result.rejections[0]?.reason).toMatch(/not on the checkpoint patch allowlist/);
    }
  });

  it("rejects a path not on the allowlist (e.g. objective) and applies nothing else in the same patch", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [
      { op: "replace", path: "/stages/0/fanout/count", value: 3 },
      { op: "replace", path: "/objective", value: "something else entirely" },
    ];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("rejected");
    expect(result.plan).toBe(plan);
  });

  it("rejects a forbidden path reached via move's 'from'", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [{ op: "move", from: "/objective", path: "/stages/0/goal" }];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("rejected");
  });
});

describe("applyPlanPatch — completed stage guard", () => {
  it("rejects any patch touching a stage that already completed", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [{ op: "replace", path: "/stages/0/fanout/count", value: 3 }];
    const result = applyPlanPatch({
      plan,
      patch,
      completedStageIds: ["s1"],
      validationContext: buildContext(),
    });
    expect(result.status).toBe("rejected");
    expect(result.plan).toBe(plan);
    if (result.status === "rejected") {
      expect(result.rejections[0]?.reason).toMatch(/already completed/);
    }
  });
});

describe("applyPlanPatch — allowed amendments apply and re-validate", () => {
  it("applies a fanout.count/maxParallel reduction and bumps the version", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [
      { op: "replace", path: "/stages/0/fanout/count", value: 3 },
      { op: "replace", path: "/stages/0/fanout/maxParallel", value: 3 },
    ];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.plan.version).toBe(2);
      expect(result.plan.stages[0]?.fanout.count).toBe(3);
      expect(result.plan.stages[0]?.fanout.maxParallel).toBe(3);
      expect(plan.stages[0]?.fanout.count).toBe(6); // original untouched
    }
  });

  it("applies a contextBudget amendment", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [
      { op: "replace", path: "/stages/0/contextBudget/maxInputTokens", value: 22000 },
    ];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.plan.stages[0]?.contextBudget.maxInputTokens).toBe(22000);
    }
  });
});

describe("applyPlanPatch — tokenBudget.hardCap direction", () => {
  it("allows lowering hardCap", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [
      { op: "replace", path: "/stages/0/tokenBudget/hardCap", value: 50000 },
    ];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.plan.stages[0]?.tokenBudget.hardCap).toBe(50000);
    }
  });

  it("rejects raising hardCap", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [
      { op: "replace", path: "/stages/0/tokenBudget/hardCap", value: 200000 },
    ];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.rejections[0]?.reason).toMatch(/only move downward/);
    }
  });
});

describe("applyPlanPatch — optional-stage add/remove", () => {
  it("allows removing an optional stage with no dependents", () => {
    const optionalStage = buildStage({ id: "s2", name: "extra polish", optional: true });
    const plan = buildPlan([buildStage(), optionalStage]);
    const patch: JsonPatchOperation[] = [{ op: "remove", path: "/stages/1" }];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.plan.stages).toHaveLength(1);
    }
  });

  it("rejects removing a non-optional stage", () => {
    const plan = buildPlan([buildStage(), buildStage({ id: "s2", name: "second", optional: false })]);
    const patch: JsonPatchOperation[] = [{ op: "remove", path: "/stages/1" }];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.rejections[0]?.reason).toMatch(/only optional stages may be removed/);
    }
  });

  it("allows adding a new optional stage", () => {
    const plan = buildPlan([buildStage()]);
    const newStage = buildStage({ id: "s2", name: "bonus pass", optional: true, dependsOn: ["s1"] });
    const patch: JsonPatchOperation[] = [{ op: "add", path: "/stages/1", value: newStage }];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.plan.stages).toHaveLength(2);
      expect(result.plan.stages[1]?.optional).toBe(true);
    }
  });

  it("rejects adding a non-optional stage via the whole-stage path", () => {
    const plan = buildPlan([buildStage()]);
    const newStage = buildStage({ id: "s2", name: "bonus pass", optional: false, dependsOn: ["s1"] });
    const patch: JsonPatchOperation[] = [{ op: "add", path: "/stages/1", value: newStage }];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("rejected");
  });

  it("rejects a whole-stage 'replace' — only add/remove are permitted there", () => {
    const plan = buildPlan([buildStage()]);
    const patch: JsonPatchOperation[] = [{ op: "replace", path: "/stages/0", value: buildStage() }];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("rejected");
  });
});

describe("applyPlanPatch — re-validation catches a structurally-broken result", () => {
  it("rejects when the patch would leave the plan invalid (e.g. fanout.count 0)", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [{ op: "replace", path: "/stages/0/fanout/count", value: 0 }];
    const result = applyPlanPatch({ plan, patch, completedStageIds: [], validationContext: buildContext() });
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.rejections[0]?.reason).toMatch(/re-validation/);
    }
  });
});

describe("applyPlanPatch — empty patch is a no-op success", () => {
  it("returns the same plan reference for an empty patch", () => {
    const plan = buildPlan();
    const result = applyPlanPatch({
      plan,
      patch: [],
      completedStageIds: [],
      validationContext: buildContext(),
    });
    expect(result).toEqual({ status: "applied", plan });
  });
});

describe("applyPlanPatchOrThrow", () => {
  it("returns the patched plan on success", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [{ op: "replace", path: "/stages/0/fanout/count", value: 3 }];
    const result = applyPlanPatchOrThrow({
      plan,
      patch,
      completedStageIds: [],
      validationContext: buildContext(),
    });
    expect(result.stages[0]?.fanout.count).toBe(3);
  });

  it("throws PlanPatchRejectedError on rejection", () => {
    const plan = buildPlan();
    const patch: JsonPatchOperation[] = [{ op: "replace", path: "/objective", value: "x" }];
    expect(() =>
      applyPlanPatchOrThrow({ plan, patch, completedStageIds: [], validationContext: buildContext() }),
    ).toThrow(/plan patch rejected/);
  });
});
