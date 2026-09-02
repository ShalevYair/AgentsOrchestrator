import { MockLLMProvider } from "@ao/providers";
import type { Plan, TaskUnderstanding } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import type { PlanValidationContext } from "../plan/index.js";
import { runPlanner } from "./planner.js";

const understanding: TaskUnderstanding = {
  intent: "analyze",
  deliverableShape: { kind: "markdown", estimatedSize: "large", structure: "sectioned" },
  evidenceNeeds: [],
  acceptanceCriteria: ["covers all core packages"],
  ambiguities: [],
  suggestedRecipe: null,
  riskFlags: [],
};

function validPlan(overrides: Partial<Plan> = {}): Plan {
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

function validationContext(overrides: Partial<PlanValidationContext> = {}): PlanValidationContext {
  return {
    budgetTotal: 1_000_000,
    budgetLevel: "standard",
    knownAgentTypes: new Set(["writer", "reader"]),
    modelMaxOutputTokens: 64_000,
    ...overrides,
  };
}

describe("runPlanner — happy path", () => {
  it("accepts a valid plan on the first attempt, with no recorded attempts", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(validPlan()) }] });
    const result = await runPlanner({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "planning",
      understanding,
      inventory: "src/ (12 files, TS)",
      validationContext: validationContext(),
      worstCasePerAttempt: 10_000,
    });
    expect(result.plan.stages).toHaveLength(1);
    expect(result.attempts).toHaveLength(0);
    expect(provider.calls.generate).toHaveLength(1);
  });
});

describe("runPlanner — budget overrun is rejected and sent back for repair", () => {
  it("rejects a plan whose stage hardCaps blow the budget, repairs, and accepts the corrected plan", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const overBudget = validPlan();
    overBudget.stages[0]!.tokenBudget.hardCap = 5_000_000; // way over budget.total
    const corrected = validPlan();

    const provider = new MockLLMProvider({
      responses: [{ text: JSON.stringify(overBudget) }, { text: JSON.stringify(corrected) }],
    });

    const result = await runPlanner({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "planning",
      understanding,
      inventory: "src/",
      validationContext: validationContext(),
      worstCasePerAttempt: 10_000,
    });

    expect(result.plan.stages[0]?.tokenBudget.hardCap).toBe(100_000);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.issues.some((i) => i.code === "V2")).toBe(true);
    expect(provider.calls.generate).toHaveLength(2);
    // the repair prompt actually named the V2 violation to the model
    const repairPrompt = provider.calls.generate[1]?.contents[0]?.parts[0]?.text ?? "";
    expect(repairPrompt).toContain("V2");
  });

  it("throws PlanInvalidError after exhausting every repair attempt", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const alwaysOverBudget = validPlan();
    alwaysOverBudget.stages[0]!.tokenBudget.hardCap = 5_000_000;
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(alwaysOverBudget) }] });

    await expect(
      runPlanner({
        ledger,
        provider,
        model: "gemini-3.7-flash",
        stageId: "planning",
        understanding,
        inventory: "src/",
        validationContext: validationContext(),
        worstCasePerAttempt: 10_000,
        maxRepairAttempts: 2,
      }),
    ).rejects.toThrow(/planner failed to produce a valid plan/);
    expect(provider.calls.generate).toHaveLength(3); // 1 initial + 2 repairs
  });

  it("treats malformed JSON as a repairable issue rather than crashing immediately", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({
      responses: [{ text: "not json at all" }, { text: JSON.stringify(validPlan()) }],
    });
    const result = await runPlanner({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "planning",
      understanding,
      inventory: "src/",
      validationContext: validationContext(),
      worstCasePerAttempt: 10_000,
    });
    expect(result.plan.stages).toHaveLength(1);
    expect(result.attempts).toHaveLength(1);
  });
});

describe("runPlanner — planning bucket cap", () => {
  it("rejects a worstCase that exceeds the planning bucket's own allocation before calling the provider", async () => {
    const ledger = new Ledger({ total: 1_000_000 }); // planning bucket = 30,000 (3%)
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(validPlan()) }] });
    await expect(
      runPlanner({
        ledger,
        provider,
        model: "gemini-3.7-flash",
        stageId: "planning",
        understanding,
        inventory: "src/",
        validationContext: validationContext(),
        worstCasePerAttempt: 40_000,
      }),
    ).rejects.toThrow();
    expect(provider.calls.generate).toHaveLength(0);
  });
});
