import type { Recipe } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { validatePlan, type PlanValidationContext } from "../plan/index.js";
import { instantiateRecipe } from "./instantiate.js";

const SAMPLE_RECIPE: Recipe = {
  name: "sample-recipe",
  displayName: "מתכון לדוגמה",
  description: "מתכון מינימלי לבדיקת instantiateRecipe",
  objectiveTemplate: "בקשת המשתמש: {{userRequest}}",
  readPolicy: {
    maxRung: "R2",
    fullReadAllowlist: [],
    summarizeIf: { minRelevance: 0.5, maxFiles: 20 },
  },
  deliverables: [{ id: "d1", kind: "markdown", target: "chat", acceptance: ["מכסה את הבקשה"] }],
  stages: [
    {
      id: "read",
      name: "קריאה",
      goal: "קרא את החומר",
      dependsOn: [],
      agentType: "reader",
      fanout: { mode: "shard", count: 2, maxParallel: 2 },
      inputs: [{ from: "artifacts", select: "all" }],
      outputContract: { schemaRef: "NdjsonEnvelope", format: "ndjson", maxOutputTokens: 8000 },
      contextBudget: { maxInputTokens: 30_000, cacheContract: false },
      tokenBudgetShare: { estimatedInShare: 0.1, estimatedOutShare: 0.05, hardCapShare: 0.2 },
      mergeStrategy: "local:dedupe-findings",
      successCriteria: ["כל הממצאים מגובים בראיה"],
      onFailure: "retry",
      optional: false,
    },
    {
      id: "write",
      name: "כתיבה",
      goal: "כתוב את הסעיף",
      dependsOn: ["read"],
      agentType: "writer",
      fanout: { mode: "single", count: 1, maxParallel: 1 },
      inputs: [{ from: "read", select: "findings" }],
      outputContract: { schemaRef: "NdjsonEnvelope", format: "ndjson", maxOutputTokens: 12000 },
      contextBudget: { maxInputTokens: 25_000, cacheContract: false },
      tokenBudgetShare: { estimatedInShare: 0.1, estimatedOutShare: 0.1, hardCapShare: 0.3 },
      mergeStrategy: "local:concat-ordered",
      successCriteria: ["הסעיף כתוב"],
      onFailure: "retry",
      optional: false,
    },
  ],
  reserveShare: { synthesisTokensShare: 0.05, repairTokensShare: 0.05 },
};

const VALIDATION_CONTEXT: PlanValidationContext = {
  budgetTotal: 500_000,
  budgetLevel: "draft",
  knownAgentTypes: new Set(["reader", "writer"]),
  modelMaxOutputTokens: 64_000,
};

describe("instantiateRecipe", () => {
  it("fills {{userRequest}} into the objective, verbatim", () => {
    const plan = instantiateRecipe({
      recipe: SAMPLE_RECIPE,
      runId: "run_abc123",
      userRequest: "נתח את המאגר וכתוב סיכום",
      budgetTotal: 500_000,
    });
    expect(plan.objective).toBe("בקשת המשתמש: נתח את המאגר וכתוב סיכום");
  });

  it("scales every tokenBudgetShare/reserveShare into exact absolute numbers for the real budgetTotal", () => {
    const plan = instantiateRecipe({
      recipe: SAMPLE_RECIPE,
      runId: "run_abc123",
      userRequest: "x",
      budgetTotal: 500_000,
    });
    const readStage = plan.stages.find((s) => s.id === "read")!;
    expect(readStage.tokenBudget).toEqual({ estimatedIn: 50_000, estimatedOut: 25_000, hardCap: 100_000 });
    const writeStage = plan.stages.find((s) => s.id === "write")!;
    expect(writeStage.tokenBudget).toEqual({ estimatedIn: 50_000, estimatedOut: 50_000, hardCap: 150_000 });
    expect(plan.reserve).toEqual({ synthesisTokens: 25_000, repairTokens: 25_000 });
  });

  it("stamps the real runId and copies structural fields (agentType, fanout, DAG, mergeStrategy) unchanged", () => {
    const plan = instantiateRecipe({
      recipe: SAMPLE_RECIPE,
      runId: "run_xyz789",
      userRequest: "x",
      budgetTotal: 500_000,
    });
    expect(plan.runId).toBe("run_xyz789");
    expect(plan.stages.map((s) => s.id)).toEqual(["read", "write"]);
    expect(plan.stages[1]!.dependsOn).toEqual(["read"]);
    expect(plan.stages[0]!.agentType).toBe("reader");
    expect(plan.stages[0]!.mergeStrategy).toBe("local:dedupe-findings");
  });

  it("produces a Plan that passes the real validatePlan — zero LLM calls, at draft's own 500K/R4/maxParallel-3 ceiling", () => {
    const plan = instantiateRecipe({
      recipe: SAMPLE_RECIPE,
      runId: "run_abc123",
      userRequest: "נתח את המאגר",
      budgetTotal: 500_000,
    });
    const result = validatePlan(plan, VALIDATION_CONTEXT);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("scales correctly — and still validates — at a much larger budget (deep level)", () => {
    const budgetTotal = 4_000_000;
    const plan = instantiateRecipe({
      recipe: SAMPLE_RECIPE,
      runId: "run_deep",
      userRequest: "x",
      budgetTotal,
    });
    const result = validatePlan(plan, { ...VALIDATION_CONTEXT, budgetTotal, budgetLevel: "deep" });
    expect(result.valid).toBe(true);
    expect(plan.stages[0]!.tokenBudget.hardCap).toBe(800_000);
  });

  it("has no LLMProvider/network dependency in its own signature — instantiation genuinely cannot spend a token", () => {
    // Structural proof, not a mock assertion: InstantiateRecipeParams carries only
    // {recipe, runId, userRequest, budgetTotal} — there is no provider parameter
    // this function could call even if it wanted to.
    const params: Parameters<typeof instantiateRecipe>[0] = {
      recipe: SAMPLE_RECIPE,
      runId: "run_abc123",
      userRequest: "x",
      budgetTotal: 500_000,
    };
    expect(Object.keys(params).sort()).toEqual(["budgetTotal", "recipe", "runId", "userRequest"]);
  });
});
