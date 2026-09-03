import { describe, expect, it } from "vitest";
import { RuntimeEventSchema } from "./events.js";

const RUN_ID = "run_01J000000000000000000000";

/** One example per row of the table in PROTOCOLS.md §9. */
const EXAMPLES: unknown[] = [
  {
    type: "run.started",
    runId: RUN_ID,
    seq: 0,
    payload: { runId: RUN_ID, budget: 2_500_000, mode: "standard" },
  },
  {
    type: "intake.progress",
    runId: RUN_ID,
    seq: 1,
    payload: { filesProcessed: 10, totalFiles: 100, bytesExtracted: 4096 },
  },
  {
    type: "understanding.ready",
    runId: RUN_ID,
    seq: 2,
    payload: {
      intent: "analyze",
      deliverableShape: { kind: "markdown", estimatedSize: "large", structure: "sectioned" },
      evidenceNeeds: [],
      acceptanceCriteria: [],
      ambiguities: [],
      suggestedRecipe: null,
      riskFlags: [],
    },
  },
  {
    type: "stage.started",
    runId: RUN_ID,
    seq: 4,
    payload: { stageId: "s1", taskCount: 6, tokensUsed: 0, criteriaMet: [] },
  },
  {
    type: "task.delta",
    runId: RUN_ID,
    seq: 5,
    payload: { taskId: "s1#0", envelope: { t: "note", text: "..." } },
  },
  {
    type: "ledger.updated",
    runId: RUN_ID,
    seq: 6,
    payload: {
      spent: 1000,
      committed: 500,
      remaining: 998_500,
      projection: 1_600_000,
      byStage: { s1: 1000 },
    },
  },
  {
    type: "budget.degraded",
    runId: RUN_ID,
    seq: 6,
    payload: { stageId: "chat", agentType: "chat", amount: 12_000, clamped: false },
  },
  {
    type: "checkpoint.decision",
    runId: RUN_ID,
    seq: 7,
    payload: { decision: "continue", reason: "on track", patch: [], confidence: 0.9 },
  },
  {
    type: "artifact.produced",
    runId: RUN_ID,
    seq: 8,
    payload: { path: "src/a.ts", sha256: "d".repeat(64), sizeBytes: 100, op: "create" },
  },
  {
    type: "run.finished",
    runId: RUN_ID,
    seq: 9,
    payload: { status: "completed", deliverables: [], ledger: {}, gaps: [] },
  },
  {
    type: "error",
    runId: RUN_ID,
    seq: 10,
    payload: { scope: "budget", code: "BUDGET_EXCEEDED", message: "...", recoverable: true },
  },
];

describe("RuntimeEventSchema", () => {
  it.each(EXAMPLES.map((e) => [(e as { type: string }).type, e] as const))(
    "parses a %s event envelope",
    (_type, example) => {
      expect(() => RuntimeEventSchema.parse(example)).not.toThrow();
    },
  );

  it("rejects an event missing seq (needed for reconnect gap-filling per §9)", () => {
    expect(() =>
      RuntimeEventSchema.parse({
        type: "run.started",
        runId: RUN_ID,
        payload: { runId: RUN_ID, budget: 1, mode: "draft" },
      }),
    ).toThrow();
  });

  it("rejects an unknown event type", () => {
    expect(() =>
      RuntimeEventSchema.parse({ type: "run.exploded", runId: RUN_ID, seq: 0, payload: {} }),
    ).toThrow();
  });
});
