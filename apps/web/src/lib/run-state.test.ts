import { describe, expect, it } from "vitest";
import { formatPlanDiff } from "@ao/core/checkpoint";
import type { JsonPatchOperation, Plan, RuntimeEvent, Stage } from "@ao/shared";
import { applyRuntimeEvent, INITIAL_RUN_STATE } from "./run-state.js";

/** Mirrors packages/core/src/checkpoint/diff.test.ts's fixture shape exactly, so events built here are indistinguishable from what real server-side code (once it exists) would actually publish. */
function buildStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: "s1",
    name: "מיפוי מבנה",
    goal: "לזהות מודולים",
    dependsOn: [],
    agentType: "reader",
    fanout: { mode: "shard", count: 6, maxParallel: 6, shardKey: "module" },
    inputs: [{ from: "artifacts", select: "repoMap" }],
    outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { maxInputTokens: 30000, cacheContract: true },
    tokenBudget: { estimatedIn: 180000, estimatedOut: 24000, hardCap: 300000 },
    mergeStrategy: "local:dedupe-findings",
    successCriteria: ["לפחות ממצא אחד"],
    onFailure: "degrade",
    optional: false,
    ...overrides,
  };
}

function buildPlan(stages: Stage[], version = 1): Plan {
  return {
    version,
    runId: "run_test123",
    objective: "ניתוח מאגר",
    deliverables: [{ id: "d1", kind: "data", target: "chat", acceptance: ["ok"] }],
    readPolicy: { maxRung: "R4", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages,
    reserve: { synthesisTokens: 120000, repairTokens: 60000 },
  };
}

function event<T extends RuntimeEvent["type"]>(
  type: T,
  payload: Extract<RuntimeEvent, { type: T }>["payload"],
  seq = 1,
): RuntimeEvent {
  return { type, runId: "run_test123", seq, payload } as RuntimeEvent;
}

describe("applyRuntimeEvent", () => {
  it("run.started resets to a fresh running state", () => {
    const dirty = { ...INITIAL_RUN_STATE, plan: buildPlan([buildStage()]), status: "completed" as const };
    const next = applyRuntimeEvent(
      dirty,
      event("run.started", { runId: "run_test123", budget: 2_500_000, mode: "standard" }),
    );
    expect(next).toEqual({ ...INITIAL_RUN_STATE, runId: "run_test123", status: "running" });
  });

  it("plan.ready populates the plan card's data", () => {
    const plan = buildPlan([buildStage()]);
    const next = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.ready", { plan, estimatedTokens: 1_600_000, requiresApproval: false }),
    );
    expect(next.plan).toEqual(plan);
    expect(next.estimatedTokens).toBe(1_600_000);
    expect(next.requiresApproval).toBe(false);
    expect(next.amendment).toBeNull();
  });

  it("plan.amended applies the patch (the card's new stage data) and records the banner text", () => {
    const plan = buildPlan([buildStage()]);
    const afterReady = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.ready", { plan, estimatedTokens: 1_600_000, requiresApproval: false }),
    );

    const patch: JsonPatchOperation[] = [{ op: "replace", path: "/stages/0/fanout/count", value: 4 }];
    const diff = formatPlanDiff(patch, plan); // the real formatter (P6-T4), not reimplemented here
    const amended = applyRuntimeEvent(
      afterReady,
      event("plan.amended", { version: 2, patch, reason: "המודולים גדולים מהצפוי", diff }),
    );

    expect(amended.plan?.stages[0]?.fanout.count).toBe(4);
    expect(amended.amendment).toEqual({
      version: 2,
      reason: "המודולים גדולים מהצפוי",
      diff: "replace /stages/0/fanout/count: 6 → 4",
    });
    // Everything else about the stage is untouched by the patch.
    expect(amended.plan?.stages[0]?.agentType).toBe("reader");
  });

  it("plan.amended with no current plan leaves state.plan as null instead of throwing", () => {
    const patch: JsonPatchOperation[] = [{ op: "replace", path: "/stages/0/fanout/count", value: 4 }];
    const next = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.amended", { version: 2, patch, reason: "x", diff: "x" }),
    );
    expect(next.plan).toBeNull();
    expect(next.amendment?.reason).toBe("x"); // the banner still shows — only the stage-data reconstruction is skipped
  });

  it("plan.amended with a patch that can't apply keeps the previous plan instead of corrupting it", () => {
    const plan = buildPlan([buildStage()]);
    const afterReady = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.ready", { plan, estimatedTokens: 1_000, requiresApproval: false }),
    );
    const badPatch: JsonPatchOperation[] = [{ op: "replace", path: "/stages/99/fanout/count", value: 4 }];
    const next = applyRuntimeEvent(
      afterReady,
      event("plan.amended", { version: 2, patch: badPatch, reason: "x", diff: "x" }),
    );
    expect(next.plan).toEqual(plan); // unchanged, not corrupted or nulled
  });

  it("run.finished records completed vs failed", () => {
    const running = { ...INITIAL_RUN_STATE, status: "running" as const };
    expect(
      applyRuntimeEvent(
        running,
        event("run.finished", { status: "completed", deliverables: [], ledger: null, gaps: [] }),
      ).status,
    ).toBe("completed");
    expect(
      applyRuntimeEvent(
        running,
        event("run.finished", { status: "failed", deliverables: [], ledger: null, gaps: [] }),
      ).status,
    ).toBe("failed");
  });

  it("an event this reducer doesn't care about yet is a no-op", () => {
    const state = { ...INITIAL_RUN_STATE, runId: "run_test123" };
    const next = applyRuntimeEvent(
      state,
      event("intake.progress", { filesProcessed: 1, totalFiles: 10, bytesExtracted: 100 }),
    );
    expect(next).toBe(state); // same reference — default branch returns state as-is
  });
});

describe("applyRuntimeEvent — orchestration board (P9-T4)", () => {
  it("stage.started creates the stage entry, tracks order, and sets currentStageId", () => {
    const next = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("stage.started", { stageId: "s1", taskCount: 6, tokensUsed: 0, criteriaMet: [] }),
    );
    expect(next.stages["s1"]).toEqual({
      stageId: "s1",
      status: "running",
      taskCount: 6,
      tokensUsed: 0,
      criteriaMet: [],
    });
    expect(next.stageOrder).toEqual(["s1"]);
    expect(next.currentStageId).toBe("s1");
  });

  it("task.started attributes the task to currentStageId (task.started itself carries no stageId)", () => {
    const afterStage = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("stage.started", { stageId: "s1", taskCount: 1, tokensUsed: 0, criteriaMet: [] }),
    );
    const next = applyRuntimeEvent(
      afterStage,
      event("task.started", { taskId: "t1", agentType: "reader", shard: "module-a", contextTokens: 5000 }),
    );
    expect(next.tasks["t1"]).toMatchObject({
      taskId: "t1",
      stageId: "s1",
      agentType: "reader",
      status: "running",
    });
    expect(next.tasksByStage["s1"]).toEqual(["t1"]);
    expect(next.tasks["t1"]?.startedAt).toBeGreaterThan(0);
  });

  it("task.delta only replaces its own task's entry — every other task keeps the same object reference (no board-wide jank)", () => {
    let state = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("stage.started", { stageId: "s1", taskCount: 2, tokensUsed: 0, criteriaMet: [] }),
    );
    state = applyRuntimeEvent(
      state,
      event("task.started", { taskId: "t1", agentType: "reader", shard: "a", contextTokens: 1000 }),
    );
    state = applyRuntimeEvent(
      state,
      event("task.started", { taskId: "t2", agentType: "reader", shard: "b", contextTokens: 1000 }),
    );
    const t2Before = state.tasks["t2"];

    const next = applyRuntimeEvent(
      state,
      event("task.delta", { taskId: "t1", envelope: { t: "note", text: "hi" } }),
    );

    expect(next.tasks["t1"]?.deltas).toEqual([{ t: "note", text: "hi" }]);
    expect(next.tasks["t2"]).toBe(t2Before); // reference-equal — untouched
  });

  it("task.delta for an unknown task id is a no-op", () => {
    const next = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("task.delta", { taskId: "ghost", envelope: { t: "note", text: "x" } }),
    );
    expect(next).toBe(INITIAL_RUN_STATE);
  });

  it("task.finished derives 'done' for a clean stop with no violations, 'issue' otherwise", () => {
    let state = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("stage.started", { stageId: "s1", taskCount: 2, tokensUsed: 0, criteriaMet: [] }),
    );
    state = applyRuntimeEvent(
      state,
      event("task.started", { taskId: "t1", agentType: "reader", shard: "a", contextTokens: 1000 }),
    );
    state = applyRuntimeEvent(
      state,
      event("task.started", { taskId: "t2", agentType: "reader", shard: "b", contextTokens: 1000 }),
    );

    const usage = { promptTokens: 100, candidatesTokens: 50, thoughtsTokens: 0, cachedTokens: 0 };
    const done = applyRuntimeEvent(
      state,
      event("task.finished", { taskId: "t1", usage, finishReason: "stop", violations: 0 }),
    );
    expect(done.tasks["t1"]?.status).toBe("done");
    expect(done.tasks["t1"]?.finishedAt).toBeGreaterThan(0);

    const issueByViolation = applyRuntimeEvent(
      state,
      event("task.finished", { taskId: "t2", usage, finishReason: "stop", violations: 2 }),
    );
    expect(issueByViolation.tasks["t2"]?.status).toBe("issue");
  });

  it("task.finished with finishReason other than stop is an issue even with zero violations", () => {
    let state = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("stage.started", { stageId: "s1", taskCount: 1, tokensUsed: 0, criteriaMet: [] }),
    );
    state = applyRuntimeEvent(
      state,
      event("task.started", { taskId: "t1", agentType: "reader", shard: "a", contextTokens: 1000 }),
    );
    const usage = { promptTokens: 100, candidatesTokens: 50, thoughtsTokens: 0, cachedTokens: 0 };
    const next = applyRuntimeEvent(
      state,
      event("task.finished", { taskId: "t1", usage, finishReason: "max_tokens", violations: 0 }),
    );
    expect(next.tasks["t1"]?.status).toBe("issue");
  });

  it("stage.finished derives 'done' when every declared successCriteria was met", () => {
    const plan = buildPlan([buildStage({ id: "s1", successCriteria: ["a", "b"] })]);
    let state = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.ready", { plan, estimatedTokens: 1000, requiresApproval: false }),
    );
    state = applyRuntimeEvent(
      state,
      event("stage.started", { stageId: "s1", taskCount: 6, tokensUsed: 0, criteriaMet: [] }),
    );
    const next = applyRuntimeEvent(
      state,
      event("stage.finished", { stageId: "s1", taskCount: 6, tokensUsed: 228000, criteriaMet: ["a", "b"] }),
    );
    expect(next.stages["s1"]?.status).toBe("done");
    expect(next.currentStageId).toBeNull(); // the finished stage was the current one
  });

  it("stage.finished derives 'issue' when some declared criteria weren't met", () => {
    const plan = buildPlan([buildStage({ id: "s1", successCriteria: ["a", "b"] })]);
    let state = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.ready", { plan, estimatedTokens: 1000, requiresApproval: false }),
    );
    state = applyRuntimeEvent(
      state,
      event("stage.started", { stageId: "s1", taskCount: 6, tokensUsed: 0, criteriaMet: [] }),
    );
    const next = applyRuntimeEvent(
      state,
      event("stage.finished", { stageId: "s1", taskCount: 6, tokensUsed: 228000, criteriaMet: ["a"] }),
    );
    expect(next.stages["s1"]?.status).toBe("issue");
  });

  it("stage.finished derives 'skipped' when the stage produced zero tasks", () => {
    const next = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("stage.finished", { stageId: "s2", taskCount: 0, tokensUsed: 0, criteriaMet: [] }),
    );
    expect(next.stages["s2"]?.status).toBe("skipped");
  });

  it("sequential stages don't clobber each other — s1 stays in stages/stageOrder once s2 starts", () => {
    let state = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("stage.started", { stageId: "s1", taskCount: 1, tokensUsed: 0, criteriaMet: [] }),
    );
    state = applyRuntimeEvent(
      state,
      event("stage.finished", { stageId: "s1", taskCount: 1, tokensUsed: 1000, criteriaMet: [] }),
    );
    state = applyRuntimeEvent(
      state,
      event("stage.started", { stageId: "s2", taskCount: 1, tokensUsed: 0, criteriaMet: [] }),
    );

    expect(state.stageOrder).toEqual(["s1", "s2"]);
    expect(state.stages["s1"]).toBeDefined();
    expect(state.currentStageId).toBe("s2");
  });

  it("handles 20 parallel tasks within one stage — every task tracked, none dropped or merged", () => {
    let state = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("stage.started", { stageId: "s1", taskCount: 20, tokensUsed: 0, criteriaMet: [] }),
    );
    for (let i = 0; i < 20; i++) {
      state = applyRuntimeEvent(
        state,
        event("task.started", {
          taskId: `t${String(i)}`,
          agentType: "reader",
          shard: `shard-${String(i)}`,
          contextTokens: 1000,
        }),
      );
    }
    expect(state.tasksByStage["s1"]).toHaveLength(20);
    expect(Object.keys(state.tasks)).toHaveLength(20);

    // Finishing task 10 must not disturb any of the other 19.
    const usage = { promptTokens: 10, candidatesTokens: 5, thoughtsTokens: 0, cachedTokens: 0 };
    const task5Before = state.tasks["t5"];
    const next = applyRuntimeEvent(
      state,
      event("task.finished", { taskId: "t10", usage, finishReason: "stop", violations: 0 }),
    );
    expect(next.tasks["t10"]?.status).toBe("done");
    expect(next.tasks["t5"]).toBe(task5Before);
  });
});

describe("applyRuntimeEvent — budget meter (P9-T6)", () => {
  it("ledger.updated stores the real spent/committed/remaining/byStage from the wire", () => {
    const next = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("ledger.updated", {
        spent: 120_000,
        committed: 30_000,
        remaining: 2_350_000,
        projection: 150_000,
        byStage: { chat: 120_000 },
      }),
    );
    expect(next.spent).toBe(120_000);
    expect(next.committed).toBe(30_000);
    expect(next.remaining).toBe(2_350_000);
    expect(next.byStage).toEqual({ chat: 120_000 });
  });

  it("a later ledger.updated replaces the earlier snapshot rather than merging byStage", () => {
    let state = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("ledger.updated", {
        spent: 100,
        committed: 0,
        remaining: 999_900,
        projection: 100,
        byStage: { s1: 100 },
      }),
    );
    state = applyRuntimeEvent(
      state,
      event("ledger.updated", {
        spent: 300,
        committed: 0,
        remaining: 999_700,
        projection: 300,
        byStage: { s1: 200, s2: 100 },
      }),
    );
    expect(state.spent).toBe(300);
    expect(state.byStage).toEqual({ s1: 200, s2: 100 });
  });

  it("run.started resets spent/committed/remaining/byStage along with everything else", () => {
    const afterLedger = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("ledger.updated", {
        spent: 500,
        committed: 0,
        remaining: 999_500,
        projection: 500,
        byStage: { s1: 500 },
      }),
    );
    const next = applyRuntimeEvent(
      afterLedger,
      event("run.started", { runId: "run_test123", budget: 1_000_000, mode: "standard" }),
    );
    expect(next.spent).toBe(0);
    expect(next.byStage).toEqual({});
  });
});
