import type { Plan, Stage } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import { concatOrdered, type SectionResult, type TaskResult } from "../reducers/index.js";
import { runScheduler, type RunTaskFn } from "../scheduler/index.js";
import { applyStageFailurePolicy } from "./stage-failure.js";
import { assembleRunOutcome } from "./run-outcome.js";

describe("assembleRunOutcome", () => {
  it("reports success with no gaps when nothing is missing", () => {
    const outcome = assembleRunOutcome("full document", []);
    expect(outcome).toEqual({ status: "success", deliverable: "full document", gaps: [] });
  });

  it("reports partial with the gaps that explain what's missing", () => {
    const gaps = [{ description: "section missing", reason: "task failed", stageId: "s1" }];
    const outcome = assembleRunOutcome("partial document", gaps);
    expect(outcome.status).toBe("partial");
    expect(outcome.gaps).toEqual(gaps);
  });

  it("never returns null/undefined for deliverable, even for an intentionally empty placeholder", () => {
    const outcome = assembleRunOutcome("", [
      { description: "nothing produced", reason: "everything failed" },
    ]);
    expect(outcome.deliverable).toBe("");
    expect(outcome.status).toBe("partial");
  });
});

describe("global guarantee — a run where every task in every stage fails still returns a deliverable", () => {
  it("composes Scheduler + stage failure policy + a local reducer into a coherent partial RunOutcome, never throwing", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const alwaysFails: RunTaskFn<SectionResult[]> = () => Promise.reject(new Error("simulated total outage"));

    function stage(id: string): Stage {
      return {
        id,
        name: id,
        goal: id,
        dependsOn: [],
        agentType: "writer",
        fanout: { mode: "shard", count: 3, maxParallel: 2, shardKey: "file" },
        inputs: [],
        outputContract: { schemaRef: "Section", format: "ndjson", maxOutputTokens: 8000 },
        contextBudget: { maxInputTokens: 1000, cacheContract: false },
        tokenBudget: { estimatedIn: 100, estimatedOut: 100, hardCap: 100_000 },
        mergeStrategy: "local:concat-ordered",
        successCriteria: ["at least one section"],
        onFailure: "degrade",
        optional: false,
      };
    }

    const plan: Plan = {
      version: 1,
      runId: "run_test123",
      objective: "write a doc",
      deliverables: [{ id: "d1", kind: "markdown", target: "chat", acceptance: [] }],
      readPolicy: { maxRung: "R2", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
      stages: [stage("s1")],
      reserve: { synthesisTokens: 10_000, repairTokens: 10_000 },
    };

    const schedulerResult = await runScheduler({
      ledger,
      plan,
      runTask: alwaysFails,
      estimateWorstCase: () => 100,
      buildShardItems: () => [{ id: "f0" }, { id: "f1" }, { id: "f2" }],
    });

    const stageResult = schedulerResult.stages[0];
    expect(stageResult).toBeDefined();
    if (!stageResult) return;

    const decision = applyStageFailurePolicy(stage("s1"), stageResult);
    expect(decision.decision).toBe("proceed");
    if (decision.decision !== "proceed") return;

    // Every task failed, so `degrade` keeps zero successful outcomes and
    // reports a gap per task — feed that empty result straight into the
    // reducer exactly as a real assembler would.
    const reducerInputs: TaskResult<SectionResult[]>[] = decision.outcomes.map((o) => ({
      taskId: o.taskId,
      value: o.value ?? [],
    }));
    const reduced = concatOrdered(reducerInputs, { stageId: "s1" });

    const outcome = assembleRunOutcome(reduced.value, [...decision.gaps, ...reduced.gaps]);

    // The whole chain never threw, and still produced a well-formed,
    // explicitly-partial RunOutcome instead of nothing at all.
    expect(outcome.status).toBe("partial");
    expect(outcome.deliverable).toBe(""); // no sections at all — empty string, not null/undefined/a crash
    expect(outcome.gaps.length).toBeGreaterThan(0);
    expect(outcome.gaps.every((g) => g.stageId === "s1" || g.stageId === undefined)).toBe(true);
    expect(ledger.openReservationCount).toBe(0); // total failure still left the ledger clean
  });
});
