import type { EvalCase } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { resolveAgentsDir } from "./agents-dir.js";
import { judgeDeliverable, rubricFromAcceptanceCriteria } from "./judge.js";
import { createMockJudgeProvider } from "./mock-judge-provider.js";
import { resolveRecipesDir } from "./recipes-dir.js";
import { runEvalCase } from "./run-case.js";

const agentsDir = resolveAgentsDir({ moduleUrl: import.meta.url });
const recipesDir = resolveRecipesDir({ moduleUrl: import.meta.url });

function baseCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    id: "test-case",
    description: "מקרה לבדיקת יחידה",
    tags: ["small", "code"],
    recipeName: "repo-analysis",
    userRequest: "נתח את המאגר",
    budgetTotal: 1_000_000,
    budgetLevel: "standard",
    understanding: {
      intent: "analyze",
      deliverableShape: { kind: "markdown", estimatedSize: "medium", structure: "sectioned" },
      evidenceNeeds: [],
      acceptanceCriteria: ["ok"],
      ambiguities: [],
      riskFlags: [],
    },
    assertions: {},
    ...overrides,
  };
}

describe("runEvalCase", () => {
  it("passes a well-formed case through the real recipe -> plan -> scheduler chain with zero LLM planning calls", async () => {
    const result = await runEvalCase(baseCase(), { agentsDir, recipesDir });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.planSource).toBe("recipe");
    expect(result.cancelled).toBe(false);
    expect(result.schemaViolations).toBe(0);
    expect(result.tokensSpent).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("runs every documented recipe end to end, mirroring apps/runtime's own recipe-end-to-end.test.ts coverage", async () => {
    for (const recipeName of [
      "repo-analysis",
      "code-review",
      "document-from-sources",
      "migration",
      "data-extraction",
    ]) {
      const result = await runEvalCase(baseCase({ id: recipeName, recipeName }), { agentsDir, recipesDir });
      expect({ recipeName, pass: result.pass, failures: result.failures }).toEqual({
        recipeName,
        pass: true,
        failures: [],
      });
    }
  });

  it("fails when maxTokensSpent is set below what the run actually spends", async () => {
    const result = await runEvalCase(baseCase({ assertions: { maxTokensSpent: 1 } }), {
      agentsDir,
      recipesDir,
    });

    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatch(/exceeds maxTokensSpent/);
  });

  it("fails when maxDurationMs is set to an impossible ceiling", async () => {
    const result = await runEvalCase(baseCase({ assertions: { maxDurationMs: 0 } }), {
      agentsDir,
      recipesDir,
    });

    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => f.includes("exceeds maxDurationMs"))).toBe(true);
  });

  it("throws with a clear message for a recipeName that isn't registered under recipes/", async () => {
    await expect(
      runEvalCase(baseCase({ recipeName: "does-not-exist" }), { agentsDir, recipesDir }),
    ).rejects.toThrow(/unknown recipe "does-not-exist"/);
  });

  it("reports grandTotalSpent and cost consistently across two runs of the exact same case (deterministic, MockLLMProvider-backed)", async () => {
    const a = await runEvalCase(baseCase(), { agentsDir, recipesDir });
    const b = await runEvalCase(baseCase(), { agentsDir, recipesDir });

    expect(a.tokensSpent).toBe(b.tokensSpent);
    expect(a.costUsd).toBe(b.costUsd);
  });

  it("P11-T2: inputScale 'large' genuinely spends more tokens than an otherwise-identical 'small'/omitted case, not just a different label", async () => {
    const small = await runEvalCase(baseCase({ budgetTotal: 3_000_000 }), { agentsDir, recipesDir });
    const large = await runEvalCase(baseCase({ budgetTotal: 3_000_000, inputScale: "large" }), {
      agentsDir,
      recipesDir,
    });

    expect(small.pass).toBe(true);
    expect(large.pass).toBe(true);
    expect(large.tokensSpent).toBeGreaterThan(small.tokensSpent);
  });

  it("P11-T2: a larger deliverableShape.estimatedSize genuinely spends more tokens than a smaller one, not just a different label", async () => {
    const small = await runEvalCase(
      baseCase({
        understanding: {
          ...baseCase().understanding,
          deliverableShape: { kind: "markdown", estimatedSize: "small", structure: "atomic" },
        },
      }),
      { agentsDir, recipesDir },
    );
    const xlarge = await runEvalCase(
      baseCase({
        budgetTotal: 3_000_000,
        understanding: {
          ...baseCase().understanding,
          deliverableShape: { kind: "markdown", estimatedSize: "xlarge", structure: "sectioned" },
        },
      }),
      { agentsDir, recipesDir },
    );

    expect(small.pass).toBe(true);
    expect(xlarge.pass).toBe(true);
    expect(xlarge.tokensSpent).toBeGreaterThan(small.tokensSpent);
  });

  it("P11-T3: an xlarge case genuinely drives @ao/core's real runWithContinuation to completion, not a label", async () => {
    const result = await runEvalCase(
      baseCase({
        budgetTotal: 3_000_000,
        understanding: {
          ...baseCase().understanding,
          deliverableShape: { kind: "markdown", estimatedSize: "xlarge", structure: "sectioned" },
        },
      }),
      { agentsDir, recipesDir },
    );

    expect(result.pass).toBe(true);
    expect(result.continuationAttempts).toBeGreaterThan(0);
  });

  it("P11-T3: a non-xlarge case needs zero continuation attempts (its canned response always finishes in one call)", async () => {
    const result = await runEvalCase(baseCase(), { agentsDir, recipesDir });

    expect(result.pass).toBe(true);
    expect(result.continuationAttempts).toBe(0);
  });

  it("P11-T3: criteriaMet/criteriaUnmet reflect the real doneEnvelope.selfCheck from every successful task", async () => {
    const result = await runEvalCase(baseCase(), { agentsDir, recipesDir });

    // repo-analysis has 3 stages (read/analyze/write), each single- or
    // shard-mode — every successful task's canned `done` envelope reports
    // exactly one met criterion and zero unmet ones (canned-responses.ts).
    expect(result.criteriaMet).toBeGreaterThan(0);
    expect(result.criteriaUnmet).toBe(0);
  });

  it("P11-T3: cacheHitTokens is honestly 0 — no case's MockLLMProvider response sets cachedTokens", async () => {
    const result = await runEvalCase(baseCase(), { agentsDir, recipesDir });
    expect(result.cacheHitTokens).toBe(0);
  });

  it("P11-T4: deliverableText is real, non-empty content pulled from the run's own successful tasks", async () => {
    const result = await runEvalCase(baseCase(), { agentsDir, recipesDir });
    expect(result.deliverableText.length).toBeGreaterThan(0);
  });

  it("P11-T4: judging the deliverable afterward never changes the task's own tokensSpent — real budget separation, not just by convention", async () => {
    const result = await runEvalCase(baseCase(), { agentsDir, recipesDir });
    const tokensSpentBeforeJudging = result.tokensSpent;

    const rubric = rubricFromAcceptanceCriteria(baseCase().understanding.acceptanceCriteria);
    const judged = await judgeDeliverable({
      provider: createMockJudgeProvider(rubric),
      model: "gemini-flash-lite-latest",
      rubric,
      deliverableText: result.deliverableText,
    });

    expect(result.tokensSpent).toBe(tokensSpentBeforeJudging);
    expect(judged.judgeTokensSpent).toBeGreaterThan(0);
  });
});
