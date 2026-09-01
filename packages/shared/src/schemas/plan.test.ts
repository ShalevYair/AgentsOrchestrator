import { describe, expect, it } from "vitest";
import { PlanSchema, type Plan } from "./plan.js";

/** Verbatim (converted to strict JSON) from PROTOCOLS.md §1. */
const EXAMPLE_PLAN: Plan = {
  version: 1,
  runId: "run_01J000000000000000000000",
  objective: "ניתוח מאגר הקוד וכתיבת מסמך ארכיטקטורה",
  deliverables: [
    {
      id: "d1",
      kind: "markdown",
      target: "chat",
      acceptance: ["מכסה את כל חבילות הליבה", "כל טענה מפנה לקובץ ושורה"],
    },
  ],
  readPolicy: {
    maxRung: "R4",
    fullReadAllowlist: ["src/index.ts"],
    summarizeIf: { minRelevance: 0.4, maxFiles: 60 },
  },
  stages: [
    {
      id: "s1",
      name: "מיפוי מבנה",
      goal: "לזהות מודולים, גבולות ותלויות",
      dependsOn: [],
      agentType: "reader",
      fanout: { mode: "shard", count: 6, maxParallel: 3, shardKey: "module" },
      inputs: [
        { from: "artifacts", select: "repoMap" },
        { from: "blackboard", select: "findings[tag=structure]" },
      ],
      outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
      contextBudget: { maxInputTokens: 30000, cacheContract: true },
      tokenBudget: { estimatedIn: 180000, estimatedOut: 48000, hardCap: 300000 },
      mergeStrategy: "local:dedupe-findings",
      successCriteria: ["לפחות ממצא אחד לכל מודול", "אפס הפרות סכמה"],
      onFailure: "degrade",
      optional: false,
    },
  ],
  reserve: { synthesisTokens: 120000, repairTokens: 60000 },
};

describe("PlanSchema", () => {
  it("parses the example from PROTOCOLS.md §1 verbatim", () => {
    const plan = PlanSchema.parse(EXAMPLE_PLAN);
    expect(plan.stages[0]?.fanout.count).toBe(6);
    expect(plan.reserve.synthesisTokens).toBe(120_000);
  });

  it("rejects an unknown top-level field (strict contract)", () => {
    expect(() => PlanSchema.parse({ ...EXAMPLE_PLAN, extra: true })).toThrow();
  });

  it("rejects a runId that doesn't match the run_ prefix convention", () => {
    expect(() => PlanSchema.parse({ ...EXAMPLE_PLAN, runId: "not-a-run-id" })).toThrow();
  });

  it("rejects a stage with zero fanout count", () => {
    const bad = structuredClone(EXAMPLE_PLAN);
    bad.stages[0]!.fanout.count = 0;
    expect(() => PlanSchema.parse(bad)).toThrow();
  });

  it("rejects an unknown reducer id in mergeStrategy", () => {
    const bad = structuredClone(EXAMPLE_PLAN);
    (bad.stages[0] as unknown as { mergeStrategy: string }).mergeStrategy = "llm:vibes";
    expect(() => PlanSchema.parse(bad as unknown)).toThrow();
  });

  it("rejects an empty stages array (a plan must do something)", () => {
    expect(() => PlanSchema.parse({ ...EXAMPLE_PLAN, stages: [] })).toThrow();
  });

  it("accepts a stage without shardKey (only meaningful for shard mode)", () => {
    const single = structuredClone(EXAMPLE_PLAN);
    single.stages[0]!.fanout = { mode: "single", count: 1, maxParallel: 1 };
    expect(() => PlanSchema.parse(single)).not.toThrow();
  });
});
