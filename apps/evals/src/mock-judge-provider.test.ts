import { describe, expect, it } from "vitest";
import { judgeDeliverable, type Rubric } from "./judge.js";
import { createMockJudgeProvider } from "./mock-judge-provider.js";

const RUBRIC: Rubric = {
  id: "test-rubric",
  criteria: [
    { id: "c1", description: "covers X", weight: 0.5 },
    { id: "c2", description: "covers Y", weight: 0.5 },
  ],
};
const MODEL = "gemini-flash-lite-latest";

describe("createMockJudgeProvider", () => {
  it("returns one score per rubric criterion, each schema-valid", async () => {
    const result = await judgeDeliverable({
      provider: createMockJudgeProvider(RUBRIC),
      model: MODEL,
      rubric: RUBRIC,
      deliverableText: "short",
    });
    expect(result.scores).toHaveLength(2);
    expect(result.scores.map((s) => s.criterionId).sort()).toEqual(["c1", "c2"]);
  });

  it("is fully deterministic — the exact same deliverable text scores identically every time", async () => {
    const a = await judgeDeliverable({
      provider: createMockJudgeProvider(RUBRIC),
      model: MODEL,
      rubric: RUBRIC,
      deliverableText: "the exact same content",
    });
    const b = await judgeDeliverable({
      provider: createMockJudgeProvider(RUBRIC),
      model: MODEL,
      rubric: RUBRIC,
      deliverableText: "the exact same content",
    });
    expect(a.overallScore).toBe(b.overallScore);
  });

  it("is not a rubber stamp — a longer real deliverable scores at least as high as a much shorter one", async () => {
    const short = await judgeDeliverable({
      provider: createMockJudgeProvider(RUBRIC),
      model: MODEL,
      rubric: RUBRIC,
      deliverableText: "x",
    });
    const long = await judgeDeliverable({
      provider: createMockJudgeProvider(RUBRIC),
      model: MODEL,
      rubric: RUBRIC,
      deliverableText: "x".repeat(500),
    });
    expect(long.overallScore).toBeGreaterThan(short.overallScore);
  });

  it("caps the score at 1 rather than growing without bound for a very long deliverable", async () => {
    const result = await judgeDeliverable({
      provider: createMockJudgeProvider(RUBRIC),
      model: MODEL,
      rubric: RUBRIC,
      deliverableText: "x".repeat(10_000),
    });
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });

  it("scores 0 for a genuinely empty deliverable", async () => {
    const result = await judgeDeliverable({
      provider: createMockJudgeProvider(RUBRIC),
      model: MODEL,
      rubric: RUBRIC,
      deliverableText: "",
    });
    expect(result.overallScore).toBe(0);
  });
});
