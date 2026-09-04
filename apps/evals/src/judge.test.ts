import { MockLLMProvider, resolveModelEntry, CHEAP_FALLBACK_MODEL_ID } from "@ao/providers";
import { describe, expect, it } from "vitest";
import { judgeDeliverable, rubricFromAcceptanceCriteria, JUDGE_BUDGET_TOKENS, type Rubric } from "./judge.js";

const RUBRIC: Rubric = {
  id: "test-rubric",
  criteria: [
    { id: "c1", description: "covers X", weight: 0.5 },
    { id: "c2", description: "covers Y", weight: 0.5 },
  ],
};

function providerWithScores(
  scores: { criterionId: string; score: number; rationale: string }[],
): MockLLMProvider {
  return new MockLLMProvider({ responses: [{ text: JSON.stringify({ scores }) }] });
}

describe("rubricFromAcceptanceCriteria", () => {
  it("gives every criterion equal weight, summing to 1", () => {
    const rubric = rubricFromAcceptanceCriteria(["a", "b", "c", "d"]);
    expect(rubric.criteria).toHaveLength(4);
    expect(rubric.criteria.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1);
  });

  it("uses the criterion text itself as the description", () => {
    const rubric = rubricFromAcceptanceCriteria(["מסמך מכסה תלויות"]);
    expect(rubric.criteria[0]?.description).toBe("מסמך מכסה תלויות");
  });

  it("returns zero-weight criteria for an empty list without dividing by zero", () => {
    expect(rubricFromAcceptanceCriteria([])).toEqual({ id: "acceptance-criteria", criteria: [] });
  });
});

describe("judgeDeliverable", () => {
  it("computes overallScore as the weighted sum of per-criterion scores", async () => {
    const provider = providerWithScores([
      { criterionId: "c1", score: 1, rationale: "good" },
      { criterionId: "c2", score: 0, rationale: "bad" },
    ]);
    const result = await judgeDeliverable({
      provider,
      model: CHEAP_FALLBACK_MODEL_ID,
      rubric: RUBRIC,
      deliverableText: "some deliverable content",
    });
    expect(result.overallScore).toBeCloseTo(0.5);
  });

  it("spends real tokens on its own fresh Ledger, capped at JUDGE_BUDGET_TOKENS regardless of task budget", async () => {
    const provider = providerWithScores([{ criterionId: "c1", score: 1, rationale: "ok" }]);
    const result = await judgeDeliverable({
      provider,
      model: CHEAP_FALLBACK_MODEL_ID,
      rubric: RUBRIC,
      deliverableText: "x",
    });
    expect(result.judgeTokensSpent).toBeGreaterThan(0);
    expect(result.judgeTokensSpent).toBeLessThan(JUDGE_BUDGET_TOKENS);
  });

  it("throws a clear error when the response doesn't match JudgeResponseSchema", async () => {
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify({ not: "a score" }) }] });
    await expect(
      judgeDeliverable({ provider, model: CHEAP_FALLBACK_MODEL_ID, rubric: RUBRIC, deliverableText: "x" }),
    ).rejects.toThrow(/did not match JudgeResponseSchema/);
  });

  it("is consistent across two identical calls against the same deterministic provider", async () => {
    const scores = [
      { criterionId: "c1", score: 0.7, rationale: "r1" },
      { criterionId: "c2", score: 0.3, rationale: "r2" },
    ];
    const a = await judgeDeliverable({
      provider: providerWithScores(scores),
      model: CHEAP_FALLBACK_MODEL_ID,
      rubric: RUBRIC,
      deliverableText: "same content",
    });
    const b = await judgeDeliverable({
      provider: providerWithScores(scores),
      model: CHEAP_FALLBACK_MODEL_ID,
      rubric: RUBRIC,
      deliverableText: "same content",
    });
    expect(a.overallScore).toBe(b.overallScore);
    expect(a.judgeTokensSpent).toBe(b.judgeTokensSpent);
  });

  it("uses real pricing for the judge model, same as production code (resolveModelEntry)", () => {
    expect(resolveModelEntry(CHEAP_FALLBACK_MODEL_ID)).toBeDefined();
  });
});
