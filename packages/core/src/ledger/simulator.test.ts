import { describe, expect, it } from "vitest";
import type { Plan, Stage } from "@ao/shared";
import { CalibrationStore } from "./calibration.js";
import { simulatePlan } from "./simulator.js";

function stage(
  overrides: Partial<Stage> & Pick<Stage, "id" | "name" | "agentType" | "fanout" | "tokenBudget">,
): Stage {
  return {
    goal: "test goal",
    dependsOn: [],
    inputs: [],
    outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { maxInputTokens: 30_000, cacheContract: true },
    mergeStrategy: "local:dedupe-findings",
    successCriteria: ["at least one finding"],
    onFailure: "degrade",
    optional: false,
    ...overrides,
  };
}

/** Mirrors BUDGET.md §6's worked example exactly (4 stages, 2.5M budget). */
function buildExamplePlan(): Plan {
  return {
    version: 1,
    runId: "run_example01",
    objective: "ניתוח מאגר וכתיבת מסמך ארכיטקטורה",
    deliverables: [{ id: "d1", kind: "markdown", target: "chat", acceptance: ["covers all core packages"] }],
    readPolicy: { maxRung: "R4", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages: [
      stage({
        id: "s1",
        name: "מיפוי מבנה",
        agentType: "reader",
        fanout: { mode: "shard", count: 6, maxParallel: 3, shardKey: "module" },
        tokenBudget: { estimatedIn: 180_000, estimatedOut: 48_000, hardCap: 300_000 },
      }),
      stage({
        id: "s2",
        name: "ניתוח ממוקד",
        agentType: "analyst",
        fanout: { mode: "shard", count: 4, maxParallel: 4, shardKey: "module" },
        tokenBudget: { estimatedIn: 420_000, estimatedOut: 64_000, hardCap: 550_000 },
      }),
      stage({
        id: "s3",
        name: "כתיבת סעיפים",
        agentType: "writer",
        fanout: { mode: "shard", count: 3, maxParallel: 3, shardKey: "section" },
        tokenBudget: { estimatedIn: 210_000, estimatedOut: 120_000, hardCap: 400_000 },
      }),
      stage({
        id: "s4",
        name: "סינתזה",
        agentType: "synthesizer",
        fanout: { mode: "single", count: 1, maxParallel: 1 },
        tokenBudget: { estimatedIn: 90_000, estimatedOut: 16_000, hardCap: 150_000 },
      }),
    ],
    reserve: { synthesisTokens: 120_000, repairTokens: 60_000 },
  };
}

describe("simulatePlan — P4-T7, matching BUDGET.md §6's worked example", () => {
  it("produces the exact per-stage totals from the doc", () => {
    const result = simulatePlan(buildExamplePlan(), 2_500_000);
    expect(result.stages.map((s) => s.totalTokens)).toEqual([228_000, 484_000, 330_000, 106_000]);
    expect(result.executionTotal).toBe(1_148_000);
  });

  it("matches the doc's overhead and reserve rows", () => {
    const result = simulatePlan(buildExamplePlan(), 2_500_000);
    expect(result.overheadTotal).toBe(175_000); // (4%+3%) * 2.5M — doc rounds to "180K"/"7%"
    expect(result.reserveTotal).toBe(300_000); // 12% * 2.5M, exact
  });

  it("matches the doc's grand total and remaining margin, within its own rounding", () => {
    const result = simulatePlan(buildExamplePlan(), 2_500_000);
    expect(result.grandTotal).toBe(1_623_000); // doc says "1,628K" (rounds its own 7% row up to 180K)
    expect(result.percentOfBudget).toBeCloseTo(0.65, 2);
    expect(result.remainingTokens).toBeGreaterThan(800_000); // doc: "margin of 872K"
  });

  it("reports a stage's agent count from fanout.count", () => {
    const result = simulatePlan(buildExamplePlan(), 2_500_000);
    expect(result.stages[0]?.agentCount).toBe(6);
    expect(result.stages[3]?.agentCount).toBe(1);
  });

  it("computes a USD estimate when pricing and a cost model id are supplied", () => {
    const result = simulatePlan(buildExamplePlan(), 2_500_000, {
      pricing: () => ({ inputPerMillionUsd: 0.75, outputPerMillionUsd: 3.75 }),
      costModelId: "gemini-3.7-flash",
    });
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("omits estimatedCostUsd entirely when no pricing is supplied", () => {
    const result = simulatePlan(buildExamplePlan(), 2_500_000);
    expect(result.estimatedCostUsd).toBeUndefined();
  });
});

describe("simulatePlan — calibration integration", () => {
  it("tightens a stage's estimate using calibration data for its (agentType, thinkingLevel)", () => {
    const calibration = new CalibrationStore();
    calibration.record({ agentType: "reader", thinkingLevel: "medium" }, 228_000, 100_000); // reader runs at ~44% of worst case
    const plan = buildExamplePlan();
    const result = simulatePlan(plan, 2_500_000, { calibration });
    const readerStage = result.stages.find((s) => s.stageId === "s1");
    expect(readerStage?.totalTokens).toBeLessThan(228_000);
    // uncalibrated stages are untouched
    const analystStage = result.stages.find((s) => s.stageId === "s2");
    expect(analystStage?.totalTokens).toBe(484_000);
  });
});
