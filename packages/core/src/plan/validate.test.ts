import { describe, expect, it } from "vitest";
import type { Plan } from "@ao/shared";
import {
  validatePlan,
  validateV1,
  validateV2,
  validateV3,
  validateV4,
  validateV5,
  validateV6,
  validateV7,
  validateV8,
  validateV9,
  type PlanValidationContext,
} from "./validate.js";

function buildValidPlan(): Plan {
  return {
    version: 1,
    runId: "run_test123",
    objective: "analyze the repo and write an architecture document",
    deliverables: [{ id: "d1", kind: "markdown", target: "chat", acceptance: ["covers core packages"] }],
    readPolicy: {
      maxRung: "R2",
      fullReadAllowlist: [],
      summarizeIf: { minRelevance: 0.4, maxFiles: 60 },
    },
    stages: [
      {
        id: "s1",
        name: "map structure",
        goal: "identify modules and boundaries",
        dependsOn: [],
        agentType: "reader",
        fanout: { mode: "shard", count: 3, maxParallel: 3, shardKey: "module" },
        inputs: [{ from: "artifacts", select: "repoMap" }],
        outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
        contextBudget: { maxInputTokens: 30000, cacheContract: true },
        tokenBudget: { estimatedIn: 180000, estimatedOut: 24000, hardCap: 100000 },
        mergeStrategy: "local:dedupe-findings",
        successCriteria: ["at least one finding per module"],
        onFailure: "degrade",
        optional: false,
      },
      {
        id: "s2",
        name: "write architecture doc",
        goal: "produce the final markdown",
        dependsOn: ["s1"],
        agentType: "writer",
        fanout: { mode: "single", count: 1, maxParallel: 1 },
        inputs: [{ from: "s1", select: "findings" }],
        outputContract: { schemaRef: "Section", format: "ndjson", maxOutputTokens: 12000 },
        contextBudget: { maxInputTokens: 30000, cacheContract: true },
        tokenBudget: { estimatedIn: 60000, estimatedOut: 12000, hardCap: 100000 },
        mergeStrategy: "local:concat-ordered",
        successCriteria: ["document has a summary section"],
        onFailure: "degrade",
        optional: false,
      },
    ],
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

describe("validatePlan — aggregator", () => {
  it("accepts a well-formed plan", () => {
    const result = validatePlan(buildValidPlan(), buildContext());
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.plan).toBeDefined();
  });

  it("never throws on malformed input and reports it under V1 with no plan attached", () => {
    const result = validatePlan({ not: "a plan" }, buildContext());
    expect(result.valid).toBe(false);
    expect(result.plan).toBeUndefined();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((i) => i.code === "V1")).toBe(true);
  });

  it("never throws on primitive/null input", () => {
    expect(() => validatePlan(null, buildContext())).not.toThrow();
    expect(() => validatePlan(undefined, buildContext())).not.toThrow();
    expect(() => validatePlan(42, buildContext())).not.toThrow();
    expect(validatePlan(null, buildContext()).valid).toBe(false);
  });

  it("surfaces multiple independent violations at once rather than stopping at the first", () => {
    const plan = buildValidPlan();
    plan.stages[0]!.agentType = "not-a-real-agent"; // V3
    plan.stages[0]!.outputContract.maxOutputTokens = 63000; // V4
    const result = validatePlan(plan, buildContext());
    expect(result.valid).toBe(false);
    const codes = new Set(result.issues.map((i) => i.code));
    expect(codes.has("V3")).toBe(true);
    expect(codes.has("V4")).toBe(true);
  });
});

describe("V1 — schema/DAG well-formedness", () => {
  it("flags a duplicate stage id", () => {
    const plan = buildValidPlan();
    plan.stages[1]!.id = "s1";
    const issues = validateV1(plan);
    expect(issues.some((i) => i.code === "V1" && i.message.includes("duplicate"))).toBe(true);
  });

  it("flags dependsOn pointing at an unknown stage", () => {
    const plan = buildValidPlan();
    plan.stages[1]!.dependsOn = ["ghost"];
    const issues = validateV1(plan);
    expect(issues.some((i) => i.message.includes("unknown stage"))).toBe(true);
  });

  it("flags a cycle in dependsOn", () => {
    const plan = buildValidPlan();
    plan.stages[0]!.dependsOn = ["s2"];
    plan.stages[1]!.dependsOn = ["s1"];
    const issues = validateV1(plan);
    expect(issues.some((i) => i.message.includes("cycle"))).toBe(true);
  });

  it("passes a well-formed acyclic DAG", () => {
    expect(validateV1(buildValidPlan())).toHaveLength(0);
  });
});

describe("V2 — budget sum", () => {
  it("flags stage hardCaps + reserve exceeding budget.total", () => {
    const plan = buildValidPlan();
    const issues = validateV2(plan, 150_000); // stages alone already sum to 200,000
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe("V2");
  });

  it("passes when the sum fits", () => {
    expect(validateV2(buildValidPlan(), 1_000_000)).toHaveLength(0);
  });
});

describe("V3 — agentType exists in registry", () => {
  it("flags an unknown agentType", () => {
    const plan = buildValidPlan();
    plan.stages[0]!.agentType = "ghost-agent";
    const issues = validateV3(plan, new Set(["writer"]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("ghost-agent");
  });

  it("passes when every agentType is registered", () => {
    expect(validateV3(buildValidPlan(), new Set(["reader", "writer"]))).toHaveLength(0);
  });
});

describe("V4 — output token safety margin", () => {
  it("flags a stage whose maxOutputTokens breaches the 10% margin", () => {
    const plan = buildValidPlan();
    plan.stages[1]!.outputContract.maxOutputTokens = 60_000; // > 64000 * 0.9 = 57600
    const issues = validateV4(plan, 64_000);
    expect(issues).toHaveLength(1);
  });

  it("passes a stage exactly at the safety-margined ceiling", () => {
    const plan = buildValidPlan();
    plan.stages[1]!.outputContract.maxOutputTokens = 57_600;
    expect(validateV4(plan, 64_000)).toHaveLength(0);
  });
});

describe("V5 — input references resolve to an earlier stage or a static source", () => {
  it("flags a from-reference to a stage that is not an ancestor", () => {
    const plan = buildValidPlan();
    plan.stages[1]!.dependsOn = []; // s2 no longer depends on s1, but still reads from it
    const issues = validateV5(plan);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("not a dependency");
  });

  it("flags a from-reference to a nonexistent stage/source", () => {
    const plan = buildValidPlan();
    plan.stages[1]!.inputs = [{ from: "s_nonexistent", select: "x" }];
    const issues = validateV5(plan);
    expect(issues).toHaveLength(1);
  });

  it("accepts static sources and true ancestors", () => {
    expect(validateV5(buildValidPlan())).toHaveLength(0);
  });
});

describe("V6 — fanout sanity and global ceilings", () => {
  it("flags maxParallel above the budget level's ceiling", () => {
    const plan = buildValidPlan();
    plan.stages[0]!.fanout.maxParallel = 10; // standard ceiling is 6
    const issues = validateV6(plan, { budgetLevel: "standard" });
    expect(issues.some((i) => i.message.includes("maxParallel"))).toBe(true);
  });

  it("flags ensemble/debate at the draft level", () => {
    const plan = buildValidPlan();
    plan.stages[0]!.fanout = { mode: "ensemble", count: 2, maxParallel: 2 };
    const issues = validateV6(plan, { budgetLevel: "draft" });
    expect(issues.some((i) => i.message.includes("blocked"))).toBe(true);
  });

  it("flags fanout.count above an explicit global ceiling", () => {
    const plan = buildValidPlan();
    const issues = validateV6(plan, { budgetLevel: "standard", globalMaxFanoutCount: 2 });
    expect(issues.some((i) => i.message.includes("fanout.count"))).toBe(true);
  });

  it("flags non-positive count/maxParallel directly", () => {
    const plan = buildValidPlan();
    (plan.stages[0]!.fanout as { count: number }).count = 0;
    const issues = validateV6(plan, { budgetLevel: "deep" });
    expect(issues.some((i) => i.message.includes("count must be"))).toBe(true);
  });

  it("allows ensemble at standard/deep and passes a well-formed plan", () => {
    expect(validateV6(buildValidPlan(), { budgetLevel: "deep" })).toHaveLength(0);
  });
});

describe("V7 — every deliverable has a producing stage", () => {
  it("flags a markdown deliverable with no writer/synthesizer stage", () => {
    const plan = buildValidPlan();
    plan.stages[1]!.agentType = "reader"; // no longer a writer
    const issues = validateV7(plan);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("d1");
  });

  it("passes when a producing role exists", () => {
    expect(validateV7(buildValidPlan())).toHaveLength(0);
  });
});

describe("V8 — readPolicy.maxRung within budget-level ceiling", () => {
  it("flags R5 requested at the draft level (max R4)", () => {
    const plan = buildValidPlan();
    plan.readPolicy.maxRung = "R5";
    const issues = validateV8(plan, "draft");
    expect(issues).toHaveLength(1);
  });

  it("passes R5 at the deep level", () => {
    const plan = buildValidPlan();
    plan.readPolicy.maxRung = "R5";
    expect(validateV8(plan, "deep")).toHaveLength(0);
  });
});

describe("V9 — mergeStrategy exists in the reducer registry (P10-T6)", () => {
  it("flags a stage whose mergeStrategy isn't in knownReducerIds", () => {
    const plan = buildValidPlan();
    plan.stages[0]!.mergeStrategy = "custom:not-registered-anywhere";
    const issues = validateV9(plan, new Set(["local:concat-ordered"]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("custom:not-registered-anywhere");
  });

  it("passes when every mergeStrategy is known, built-in or custom alike", () => {
    const plan = buildValidPlan();
    plan.stages[0]!.mergeStrategy = "custom:my-reducer";
    const issues = validateV9(plan, new Set(["custom:my-reducer", "local:concat-ordered"]));
    expect(issues).toHaveLength(0);
  });

  it("validatePlan skips V9 entirely when the caller doesn't supply knownReducerIds — no regression for existing callers", () => {
    const plan = buildValidPlan();
    plan.stages[0]!.mergeStrategy = "custom:whatever";
    const result = validatePlan(plan, buildContext());
    expect(result.valid).toBe(true);
  });

  it("validatePlan runs V9 and rejects an unknown mergeStrategy when the caller opts in via knownReducerIds", () => {
    const plan = buildValidPlan();
    plan.stages[0]!.mergeStrategy = "custom:whatever";
    const result = validatePlan(plan, buildContext({ knownReducerIds: new Set(["local:concat-ordered"]) }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "V9")).toBe(true);
  });
});

describe("phase-level done criterion — an invalid plan never reaches an execution-ready state", () => {
  it("a plan violating multiple V-checks reports valid:false and withholds `.plan`", () => {
    const plan = buildValidPlan();
    plan.stages[0]!.dependsOn = ["s2"];
    plan.stages[1]!.dependsOn = ["s1"]; // V1 cycle
    plan.stages[0]!.agentType = "ghost"; // V3
    const result = validatePlan(plan, buildContext());
    expect(result.valid).toBe(false);
    expect(result.plan).toBeUndefined();
  });
});
