import { MockLLMProvider } from "@ao/providers";
import type { CheckpointDecision, Plan, Stage } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import type { PlanValidationContext } from "../plan/index.js";
import { computeCheckpointSignals } from "./signals.js";
import { runCheckpointGate } from "./gate.js";
import { applyPlanPatch } from "./patch.js";
import { PlanVersionHistory } from "./versions.js";

function buildStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: "s2",
    name: "read the modules",
    goal: "gather findings from every module",
    dependsOn: [],
    agentType: "reader",
    fanout: { mode: "shard", count: 8, maxParallel: 8, shardKey: "module" },
    inputs: [{ from: "artifacts", select: "repoMap" }],
    outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { maxInputTokens: 30000, cacheContract: true },
    tokenBudget: { estimatedIn: 200000, estimatedOut: 24000, hardCap: 120000 },
    mergeStrategy: "local:dedupe-findings",
    successCriteria: ["at least one finding per module"],
    onFailure: "degrade",
    optional: false,
    ...overrides,
  };
}

function buildPlan(): Plan {
  return {
    version: 1,
    runId: "run_test123",
    objective: "analyze an unexpectedly large repository",
    deliverables: [{ id: "d1", kind: "data", target: "chat", acceptance: ["covers every module"] }],
    readPolicy: { maxRung: "R2", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages: [buildStage()],
    reserve: { synthesisTokens: 50000, repairTokens: 50000 },
  };
}

function buildContext(): PlanValidationContext {
  return {
    budgetTotal: 1_000_000,
    budgetLevel: "standard",
    knownAgentTypes: new Set(["reader"]),
    modelMaxOutputTokens: 64_000,
  };
}

/**
 * P6's own phase-level "definition of done" (TASKS.md): "ריצה שנתקלת
 * בקלט גדול מהצפוי מצמצמת fan-out תוך כדי, מסיימת בתקציב, ומראה למשתמש
 * מה השתנה ולמה" — a run that hits larger-than-expected input reduces
 * fan-out on the fly, finishes within budget, and shows the user what
 * changed and why. This wires together every P6 task end to end: T1's
 * signal fires on real budget drift, T5's gate calls T2's cheap
 * checkpoint agent (only because that signal fired — nothing here is a
 * mandatory point), T3 safely applies the resulting patch, and T4 records
 * a new plan version with a human-readable diff a UI could show verbatim.
 */
describe("P6 phase-level done criterion", () => {
  it("a stage that overran its estimate gets its fan-out reduced via checkpoint, safely, and the change is explainable", async () => {
    const plan = buildPlan();
    const ledger = new Ledger({ total: 1_000_000 });
    const history = new PlanVersionHistory(plan);

    // The stage's actual spend came in far over its estimate — a real
    // signal, not a manufactured one (PROTOCOLS.md §6's budgetDrift row:
    // "ניצול בפועל חורג מההערכה ביותר מ-25%").
    const estimatedTokens =
      plan.stages[0]!.tokenBudget.estimatedIn + plan.stages[0]!.tokenBudget.estimatedOut;
    const actualTokens = Math.floor(estimatedTokens * 1.6); // 60% over — modules were bigger than expected
    const signals = computeCheckpointSignals({
      stage: plan.stages[0]!,
      reportedCriteriaMet: [["at least one finding per module"]],
      estimatedTokens,
      actualTokens,
      envelopeCounts: [4],
      ensembleContradiction: false,
      unresolvedNeedsCount: 0,
      anyTaskViolationRatioExceeded: false,
    });
    expect(signals.budgetDrift).toBe(true);

    const amendDecision: CheckpointDecision = {
      decision: "amend",
      reason: "modules are running larger than estimated; reducing fan-out to stay in budget",
      patch: [
        { op: "replace", path: "/stages/0/fanout/count", value: 4 },
        { op: "replace", path: "/stages/0/fanout/maxParallel", value: 4 },
      ],
      confidence: 0.85,
    };
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(amendDecision) }] });

    const gateResult = await runCheckpointGate({
      ledger,
      provider,
      model: "gemini-flash-lite-latest",
      stageId: "s2",
      signals,
      summaryInput: {
        stageId: "s2",
        stageName: plan.stages[0]!.name,
        budget: { allocated: 580_000, spent: actualTokens, committed: 0, available: 580_000 - actualTokens },
        gaps: [],
        taskOutcomeCounts: { success: 4, failed: 0, budgetRejected: 0, cancelled: 0 },
        successCriteria: plan.stages[0]!.successCriteria,
        unmetCriteria: [],
      },
      worstCase: 1500,
    });

    // T1+T5: the agent was actually called, because a real signal fired.
    expect(gateResult.calledAgent).toBe(true);
    expect(gateResult.triggerReason).toBe("signal");
    expect(gateResult.decision.decision).toBe("amend");

    // T3: the fan-out reduction is safely applied and re-validated.
    const patchResult = applyPlanPatch({
      plan: history.current(),
      patch: gateResult.decision.patch,
      completedStageIds: [],
      validationContext: buildContext(),
    });
    expect(patchResult.status).toBe("applied");
    if (patchResult.status !== "applied") return;
    expect(patchResult.plan.stages[0]?.fanout.count).toBe(4); // fan-out genuinely reduced

    // T4: a new version exists with a diff a UI could render as-is.
    const versionEntry = history.recordAmendment(
      patchResult.plan,
      gateResult.decision.patch,
      gateResult.decision.reason,
    );
    expect(versionEntry.version).toBe(2);
    expect(versionEntry.diff).toContain("replace /stages/0/fanout/count: 8 → 4");
    expect(versionEntry.reason).toBe(amendDecision.reason);

    // The whole checkpoint round-trip cost only a sliver of the run's
    // budget — nowhere near overrunning it — and touched only the
    // checkpoints bucket, never the locked reserve.
    expect(ledger.bucketSnapshot("checkpoints").spent).toBeGreaterThan(0);
    expect(ledger.bucketSnapshot("checkpoints").spent).toBeLessThan(
      ledger.bucketSnapshot("checkpoints").allocated,
    );
    expect(ledger.available).toBeGreaterThan(0);
  });

  it("with no signal and no mandatory point, the same stage boundary costs nothing at all", async () => {
    const plan = buildPlan();
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({
      responses: [{ text: JSON.stringify({ decision: "amend", reason: "x", patch: [], confidence: 1 }) }],
    });

    const signals = computeCheckpointSignals({
      stage: plan.stages[0]!,
      reportedCriteriaMet: [["at least one finding per module"]],
      estimatedTokens: 224000,
      actualTokens: 224000, // right on estimate
      envelopeCounts: [4],
      ensembleContradiction: false,
      unresolvedNeedsCount: 0,
      anyTaskViolationRatioExceeded: false,
    });
    expect(signals.budgetDrift).toBe(false);

    const gateResult = await runCheckpointGate({
      ledger,
      provider,
      model: "gemini-flash-lite-latest",
      stageId: "s2",
      signals,
      summaryInput: {
        stageId: "s2",
        stageName: plan.stages[0]!.name,
        budget: { allocated: 580_000, spent: 224000, committed: 0, available: 356_000 },
        gaps: [],
        taskOutcomeCounts: { success: 4, failed: 0, budgetRejected: 0, cancelled: 0 },
        successCriteria: plan.stages[0]!.successCriteria,
        unmetCriteria: [],
      },
      worstCase: 1500,
    });

    expect(gateResult.calledAgent).toBe(false);
    expect(provider.calls.generate).toHaveLength(0);
    expect(ledger.spent).toBe(0);
  });
});
