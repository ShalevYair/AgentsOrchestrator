import { MockLLMProvider } from "@ao/providers";
import type { Plan, Recipe, TaskUnderstanding } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import type { PlanValidationContext } from "../plan/index.js";
import { planWithRecipe } from "./plan-with-recipe.js";

const SAMPLE_RECIPE: Recipe = {
  name: "repo-analysis",
  displayName: "ניתוח מאגר",
  description: "מתכון לבדיקה",
  objectiveTemplate: "בקשה: {{userRequest}}",
  readPolicy: { maxRung: "R2", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.5, maxFiles: 20 } },
  deliverables: [{ id: "d1", kind: "markdown", target: "chat", acceptance: ["ok"] }],
  stages: [
    {
      id: "s1",
      name: "כתיבה",
      goal: "כתוב",
      dependsOn: [],
      agentType: "writer",
      fanout: { mode: "single", count: 1, maxParallel: 1 },
      inputs: [{ from: "artifacts", select: "all" }],
      outputContract: { schemaRef: "NdjsonEnvelope", format: "ndjson", maxOutputTokens: 8000 },
      contextBudget: { maxInputTokens: 20_000, cacheContract: false },
      tokenBudgetShare: { estimatedInShare: 0.1, estimatedOutShare: 0.1, hardCapShare: 0.3 },
      mergeStrategy: "local:concat-ordered",
      successCriteria: ["ok"],
      onFailure: "retry",
      optional: false,
    },
  ],
  reserveShare: { synthesisTokensShare: 0.05, repairTokensShare: 0.05 },
};

function understanding(overrides: Partial<TaskUnderstanding> = {}): TaskUnderstanding {
  return {
    intent: "analyze",
    deliverableShape: { kind: "markdown", estimatedSize: "large", structure: "sectioned" },
    evidenceNeeds: [],
    acceptanceCriteria: ["covers the repo"],
    ambiguities: [],
    suggestedRecipe: null,
    riskFlags: [],
    ...overrides,
  };
}

function validationContext(overrides: Partial<PlanValidationContext> = {}): PlanValidationContext {
  return {
    budgetTotal: 500_000,
    budgetLevel: "draft",
    knownAgentTypes: new Set(["writer", "reader"]),
    modelMaxOutputTokens: 64_000,
    ...overrides,
  };
}

function fallbackPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    runId: "run_test123",
    objective: "analyze the repo",
    deliverables: [{ id: "d1", kind: "markdown", target: "chat", acceptance: ["x"] }],
    readPolicy: { maxRung: "R2", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages: [
      {
        id: "s1",
        name: "write doc",
        goal: "produce the doc",
        dependsOn: [],
        agentType: "writer",
        fanout: { mode: "single", count: 1, maxParallel: 1 },
        inputs: [{ from: "artifacts", select: "repoMap" }],
        outputContract: { schemaRef: "Section", format: "ndjson", maxOutputTokens: 8000 },
        contextBudget: { maxInputTokens: 30000, cacheContract: true },
        tokenBudget: { estimatedIn: 60000, estimatedOut: 12000, hardCap: 100000 },
        mergeStrategy: "local:concat-ordered",
        successCriteria: ["has a summary"],
        onFailure: "degrade",
        optional: false,
      },
    ],
    reserve: { synthesisTokens: 50000, repairTokens: 50000 },
    ...overrides,
  };
}

describe("planWithRecipe — a matched, valid recipe short-circuits the LLM entirely", () => {
  it("uses the recipe with zero provider calls when suggestedRecipe matches a registered recipe", async () => {
    const ledger = new Ledger({ total: 500_000 });
    const provider = new MockLLMProvider({ responses: [] });
    const result = await planWithRecipe({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "planning",
      understanding: understanding({ suggestedRecipe: "repo-analysis" }),
      inventory: "src/ (12 files, TS)",
      validationContext: validationContext(),
      worstCasePerAttempt: 10_000,
      recipeRegistry: { "repo-analysis": SAMPLE_RECIPE },
      runId: "run_real456",
      userRequest: "נתח את המאגר",
    });

    expect(result.source).toBe("recipe");
    expect(result.attempts).toEqual([]);
    expect(provider.calls.generate).toHaveLength(0);
    expect(result.plan.runId).toBe("run_real456");
    expect(result.plan.objective).toBe("בקשה: נתח את המאגר");
  });
});

describe("planWithRecipe — falls back to the real runPlanner", () => {
  it("falls back when suggestedRecipe is null", async () => {
    const ledger = new Ledger({ total: 500_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(fallbackPlan()) }] });
    const result = await planWithRecipe({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "planning",
      understanding: understanding({ suggestedRecipe: null }),
      inventory: "src/ (12 files, TS)",
      validationContext: validationContext({ budgetTotal: 1_000_000, budgetLevel: "standard" }),
      worstCasePerAttempt: 10_000,
      recipeRegistry: { "repo-analysis": SAMPLE_RECIPE },
      runId: "run_real456",
      userRequest: "נתח את המאגר",
    });

    expect(result.source).toBe("planner");
    expect(provider.calls.generate).toHaveLength(1);
    expect(result.plan.stages).toHaveLength(1);
  });

  it("falls back when suggestedRecipe names a recipe that isn't registered", async () => {
    const ledger = new Ledger({ total: 500_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(fallbackPlan()) }] });
    const result = await planWithRecipe({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "planning",
      understanding: understanding({ suggestedRecipe: "no-such-recipe" }),
      inventory: "src/ (12 files, TS)",
      validationContext: validationContext({ budgetTotal: 1_000_000, budgetLevel: "standard" }),
      worstCasePerAttempt: 10_000,
      recipeRegistry: { "repo-analysis": SAMPLE_RECIPE },
      runId: "run_real456",
      userRequest: "נתח את המאגר",
    });

    expect(result.source).toBe("planner");
    expect(provider.calls.generate).toHaveLength(1);
  });

  it("falls back when the matched recipe fails to validate for this run (agentType not in this run's registry)", async () => {
    // Deliberately references an agentType this run's registry doesn't
    // have — instantiateRecipe still produces *a* Plan (it does no
    // validation itself), but validatePlan's V3 rejects it, so this must
    // fall back to the real planner rather than silently use a Plan that
    // references an unregistered agent type. knownAgentTypes below keeps
    // "writer" (the fallback plan fixture's own agentType) valid, so a
    // successful fallback proves this is really about the recipe stage's
    // bogus type, not an unrelated V3 failure on the fallback path too.
    const brokenRecipe: Recipe = {
      ...SAMPLE_RECIPE,
      stages: [{ ...SAMPLE_RECIPE.stages[0]!, agentType: "no-such-agent-type" }],
    };
    const ledger = new Ledger({ total: 500_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(fallbackPlan()) }] });
    const result = await planWithRecipe({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "planning",
      understanding: understanding({ suggestedRecipe: "repo-analysis" }),
      inventory: "src/ (12 files, TS)",
      validationContext: validationContext({ knownAgentTypes: new Set(["reader", "writer"]) }),
      worstCasePerAttempt: 10_000,
      recipeRegistry: { "repo-analysis": brokenRecipe },
      runId: "run_real456",
      userRequest: "נתח את המאגר",
    });

    expect(result.source).toBe("planner");
    expect(provider.calls.generate).toHaveLength(1);
  });

  it("falls back with no recipeRegistry at all — behaves exactly like plain runPlanner", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(fallbackPlan()) }] });
    const result = await planWithRecipe({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "planning",
      understanding: understanding({ suggestedRecipe: "repo-analysis" }),
      inventory: "src/ (12 files, TS)",
      validationContext: validationContext({ budgetTotal: 1_000_000, budgetLevel: "standard" }),
      worstCasePerAttempt: 10_000,
      runId: "run_real456",
      userRequest: "נתח את המאגר",
    });

    expect(result.source).toBe("planner");
    expect(provider.calls.generate).toHaveLength(1);
  });
});
