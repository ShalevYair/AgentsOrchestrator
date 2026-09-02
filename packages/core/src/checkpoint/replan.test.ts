import { MockLLMProvider } from "@ao/providers";
import type { Plan, Stage, TaskUnderstanding } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import type { PlanValidationContext } from "../plan/index.js";
import { runScheduler, type RunTaskFn } from "../scheduler/index.js";
import { buildReplan, runReplan } from "./replan.js";

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

function buildContext(): PlanValidationContext {
  return {
    budgetTotal: 1_000_000,
    budgetLevel: "standard",
    knownAgentTypes: new Set(["reader", "writer", "planner", "recon"]),
    modelMaxOutputTokens: 64_000,
  };
}

const understanding: TaskUnderstanding = {
  intent: "analyze",
  deliverableShape: { kind: "markdown", estimatedSize: "large", structure: "sectioned" },
  evidenceNeeds: [{ what: "repo structure", rung: "R1", why: "needed to map boundaries" }],
  acceptanceCriteria: ["covers all core packages"],
  ambiguities: [],
  suggestedRecipe: null,
  riskFlags: [],
};

describe("buildReplan", () => {
  it("renumbers the candidate to continue the old plan's version and re-validates", () => {
    const oldPlan = buildPlan([buildStage({ id: "s1" }), buildStage({ id: "s2", dependsOn: ["s1"] })], 3);
    const candidate = buildPlan(
      [buildStage({ id: "s1" }), buildStage({ id: "s2", dependsOn: ["s1"], agentType: "writer" })],
      1,
    );

    const result = buildReplan({
      oldPlan,
      newPlanCandidate: candidate,
      completedStageIds: ["s1"],
      validationContext: buildContext(),
    });

    expect(result.version).toBe(4);
    expect(result.plan.version).toBe(4);
    expect(result.preservedStageIds).toEqual(["s1"]);
    expect(result.diff).toContain("agentType: reader → writer");
  });

  it("throws when the renumbered candidate fails re-validation", () => {
    const oldPlan = buildPlan([buildStage()], 1);
    const badCandidate = buildPlan(
      [buildStage({ fanout: { mode: "shard", count: 0, maxParallel: 1, shardKey: "m" } })],
      1,
    );
    expect(() =>
      buildReplan({
        oldPlan,
        newPlanCandidate: badCandidate,
        completedStageIds: [],
        validationContext: buildContext(),
      }),
    ).toThrow(/re-validation/);
  });

  it("preserves completed stage ids even when the new plan no longer declares them", () => {
    const oldPlan = buildPlan([buildStage({ id: "s1" }), buildStage({ id: "s2", dependsOn: ["s1"] })], 1);
    const candidate = buildPlan([buildStage({ id: "s3" })], 1); // s1/s2 dropped entirely
    const result = buildReplan({
      oldPlan,
      newPlanCandidate: candidate,
      completedStageIds: ["s1", "s2"],
      validationContext: buildContext(),
    });
    expect(result.preservedStageIds).toEqual(["s1", "s2"]);
    expect(result.plan.stages.map((s) => s.id)).toEqual(["s3"]);
  });
});

describe("runReplan — end to end with a mocked planner call", () => {
  it("calls the planner and produces a versioned, diffed plan preserving completed work", async () => {
    const oldPlan = buildPlan([buildStage({ id: "s1" }), buildStage({ id: "s2", dependsOn: ["s1"] })], 1);
    const candidate = buildPlan(
      [
        buildStage({ id: "s1" }),
        buildStage({ id: "s2", dependsOn: ["s1"], fanout: { mode: "single", count: 1, maxParallel: 1 } }),
      ],
      1,
    );
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(candidate) }] });

    const result = await runReplan({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "replan",
      oldPlan,
      completedStageIds: ["s1"],
      understanding,
      inventory: "src/ (10 files)",
      validationContext: buildContext(),
      worstCasePerAttempt: 10_000,
    });

    expect(result.version).toBe(2);
    expect(result.preservedStageIds).toEqual(["s1"]);
    expect(result.plannerAttempts).toHaveLength(0); // accepted on the first attempt
    expect(ledger.bucketSnapshot("planning").spent).toBeGreaterThan(0);
  });

  it("integrates with the Scheduler: preserved stages are skipped, others run", async () => {
    const singleFanoutStage = (id: string, deps: string[] = []): Stage =>
      buildStage({ id, dependsOn: deps, fanout: { mode: "single", count: 1, maxParallel: 1 } });
    const oldPlan = buildPlan([singleFanoutStage("s1"), singleFanoutStage("s2", ["s1"])], 1);
    const candidate = buildPlan([singleFanoutStage("s1"), singleFanoutStage("s2", ["s1"])], 1);
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(candidate) }] });

    const replanResult = await runReplan({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "replan",
      oldPlan,
      completedStageIds: ["s1"],
      understanding,
      inventory: "src/",
      validationContext: buildContext(),
      worstCasePerAttempt: 10_000,
    });

    const executed: string[] = [];
    const runTask: RunTaskFn<null> = (task) => {
      executed.push(task.stageId);
      return Promise.resolve({
        usage: { promptTokens: 5, candidatesTokens: 5, thoughtsTokens: 0, cachedTokens: 0 },
        value: null,
      });
    };
    const schedulerResult = await runScheduler({
      ledger,
      plan: replanResult.plan,
      runTask,
      estimateWorstCase: () => 100,
      skipStageIds: new Set(replanResult.preservedStageIds),
    });

    expect(executed).toEqual(["s2"]);
    expect(schedulerResult.stages.find((s) => s.stageId === "s1")?.skipped).toBe(true);
  });
});
