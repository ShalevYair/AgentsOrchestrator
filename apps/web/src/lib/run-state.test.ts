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
