import type { Plan, Stage } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import { runScheduler, type RunTaskFn, type ScheduledTask } from "./scheduler.js";

function stage(id: string, overrides: Partial<Stage> = {}): Stage {
  return {
    id,
    name: id,
    goal: id,
    dependsOn: [],
    agentType: "reader",
    fanout: { mode: "single", count: 1, maxParallel: 1 },
    inputs: [],
    outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { maxInputTokens: 1000, cacheContract: false },
    tokenBudget: { estimatedIn: 100, estimatedOut: 100, hardCap: 100_000 },
    mergeStrategy: "local:dedupe-findings",
    successCriteria: [],
    onFailure: "degrade",
    optional: false,
    ...overrides,
  };
}

function plan(stages: Stage[]): Plan {
  return {
    version: 1,
    runId: "run_test123",
    objective: "test",
    deliverables: [{ id: "d1", kind: "data", target: "chat", acceptance: [] }],
    readPolicy: { maxRung: "R2", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages,
    reserve: { synthesisTokens: 10_000, repairTokens: 10_000 },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runScheduler — topological stage order", () => {
  it("runs dependent stages after their dependencies, even though they're declared out of order", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const executionLog: string[] = [];
    const runTask: RunTaskFn<null> = (task) => {
      executionLog.push(task.stageId);
      return Promise.resolve({
        usage: { promptTokens: 10, candidatesTokens: 10, thoughtsTokens: 0, cachedTokens: 0 },
        value: null,
      });
    };

    const testPlan = plan([
      stage("s3", { dependsOn: ["s2"] }),
      stage("s1"),
      stage("s2", { dependsOn: ["s1"] }),
    ]);
    await runScheduler({ ledger, plan: testPlan, runTask, estimateWorstCase: () => 100 });

    expect(executionLog).toEqual(["s1", "s2", "s3"]);
  });
});

describe("runScheduler — bounded concurrency", () => {
  it("never runs more Tasks concurrently than the stage's maxParallel", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    let active = 0;
    let maxObserved = 0;
    const runTask: RunTaskFn<null> = async () => {
      active += 1;
      maxObserved = Math.max(maxObserved, active);
      await delay(5);
      active -= 1;
      return {
        usage: { promptTokens: 1, candidatesTokens: 1, thoughtsTokens: 0, cachedTokens: 0 },
        value: null,
      };
    };

    const testPlan = plan([
      stage("s1", { fanout: { mode: "shard", count: 6, maxParallel: 2, shardKey: "file" } }),
    ]);
    await runScheduler({
      ledger,
      plan: testPlan,
      runTask,
      estimateWorstCase: () => 100,
      buildShardItems: () => Array.from({ length: 6 }, (_, i) => ({ id: `f${String(i)}` })),
    });

    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it("property: across many random maxParallel/count shapes, observed concurrency never exceeds the ceiling", async () => {
    let seed = 123;
    function nextRandom(): number {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }

    for (let trial = 0; trial < 25; trial++) {
      const ledger = new Ledger({ total: 10_000_000 });
      const count = 1 + Math.floor(nextRandom() * 10);
      const maxParallel = 1 + Math.floor(nextRandom() * 6);
      let active = 0;
      let maxObserved = 0;
      const runTask: RunTaskFn<null> = async () => {
        active += 1;
        maxObserved = Math.max(maxObserved, active);
        await delay(Math.floor(nextRandom() * 3));
        active -= 1;
        return {
          usage: { promptTokens: 1, candidatesTokens: 1, thoughtsTokens: 0, cachedTokens: 0 },
          value: null,
        };
      };
      const testPlan = plan([
        stage("s1", { fanout: { mode: "shard", count, maxParallel, shardKey: "file" } }),
      ]);
      await runScheduler({
        ledger,
        plan: testPlan,
        runTask,
        estimateWorstCase: () => 10,
        buildShardItems: () => Array.from({ length: count }, (_, i) => ({ id: `f${String(i)}` })),
      });
      expect(maxObserved).toBeLessThanOrEqual(maxParallel);
    }
  });

  it("forces pipeline-mode Stages to run at concurrency 1 regardless of maxParallel", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    let active = 0;
    let maxObserved = 0;
    const runTask: RunTaskFn<null> = async () => {
      active += 1;
      maxObserved = Math.max(maxObserved, active);
      await delay(3);
      active -= 1;
      return {
        usage: { promptTokens: 1, candidatesTokens: 1, thoughtsTokens: 0, cachedTokens: 0 },
        value: null,
      };
    };
    const testPlan = plan([stage("s1", { fanout: { mode: "pipeline", count: 4, maxParallel: 4 } })]);
    await runScheduler({ ledger, plan: testPlan, runTask, estimateWorstCase: () => 10 });
    expect(maxObserved).toBe(1);
  });
});

describe("runScheduler — cancellation", () => {
  it("stops cleanly without leaking any committed reservation", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const controller = new AbortController();
    const runTask: RunTaskFn<null> = async (_task, signal) => {
      await delay(15); // long enough for the test to call abort() while this is in flight
      if (signal.aborted) throw new Error("aborted");
      return {
        usage: { promptTokens: 10, candidatesTokens: 10, thoughtsTokens: 0, cachedTokens: 0 },
        value: null,
      };
    };

    setTimeout(() => controller.abort(), 5);

    const testPlan = plan([
      stage("s1", { fanout: { mode: "shard", count: 3, maxParallel: 1, shardKey: "file" } }),
      stage("s2", { dependsOn: ["s1"] }),
    ]);
    const result = await runScheduler({
      ledger,
      plan: testPlan,
      runTask,
      estimateWorstCase: () => 100,
      buildShardItems: () => Array.from({ length: 3 }, (_, i) => ({ id: `f${String(i)}` })),
      signal: controller.signal,
    });

    expect(result.cancelled).toBe(true);
    expect(ledger.openReservationCount).toBe(0); // no leaked committed tokens
    // s2 (dependent on s1, runs later in topological order) never ran at all.
    expect(result.stages.some((s) => s.stageId === "s2")).toBe(false);
  });

  it("marks tasks not yet started as cancelled once the signal has already fired", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const controller = new AbortController();
    controller.abort(); // already aborted before the run even starts
    const runTask: RunTaskFn<null> = () => Promise.reject(new Error("should never be called"));
    const testPlan = plan([
      stage("s1", { fanout: { mode: "shard", count: 2, maxParallel: 2, shardKey: "file" } }),
    ]);
    const result = await runScheduler({
      ledger,
      plan: testPlan,
      runTask,
      estimateWorstCase: () => 100,
      buildShardItems: () => Array.from({ length: 2 }, (_, i) => ({ id: `f${String(i)}` })),
      signal: controller.signal,
    });
    expect(result.cancelled).toBe(true);
    expect(ledger.openReservationCount).toBe(0);
  });
});

describe("runScheduler — budget rejection", () => {
  it("marks a Task budget-rejected without ever calling runTask or leaving a reservation", async () => {
    const ledger = new Ledger({ total: 100_000 }); // execution bucket = 58,000
    let calls = 0;
    const runTask: RunTaskFn<null> = () => {
      calls += 1;
      return Promise.resolve({
        usage: { promptTokens: 1, candidatesTokens: 1, thoughtsTokens: 0, cachedTokens: 0 },
        value: null,
      });
    };
    const testPlan = plan([stage("s1")]);
    const result = await runScheduler({
      ledger,
      plan: testPlan,
      runTask,
      estimateWorstCase: () => 1_000_000, // far beyond the execution bucket
    });
    expect(result.stages[0]?.outcomes[0]?.status).toBe("budget-rejected");
    expect(calls).toBe(0);
    expect(ledger.openReservationCount).toBe(0);
  });
});

describe("runScheduler — task failure", () => {
  it("marks a thrown task as failed and releases its reservation, without stopping the run", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const runTask: RunTaskFn<null> = (task: ScheduledTask) => {
      if (task.taskId === "s1#0") return Promise.reject(new Error("boom"));
      return Promise.resolve({
        usage: { promptTokens: 1, candidatesTokens: 1, thoughtsTokens: 0, cachedTokens: 0 },
        value: null,
      });
    };
    const testPlan = plan([
      stage("s1", { fanout: { mode: "shard", count: 1, maxParallel: 1, shardKey: "file" } }),
      stage("s2", { dependsOn: ["s1"] }),
    ]);
    const result = await runScheduler({
      ledger,
      plan: testPlan,
      runTask,
      estimateWorstCase: () => 100,
      buildShardItems: (s) => (s.id === "s1" ? [{ id: "f0" }] : []),
    });
    expect(result.stages[0]?.outcomes[0]?.status).toBe("failed");
    expect(result.stages.some((s) => s.stageId === "s2")).toBe(true); // the run continued past the failure
    expect(ledger.openReservationCount).toBe(0);
  });
});

describe("runScheduler — sharding wiring", () => {
  it("gives each shard-mode Task its own shard from buildShardItems", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const seenShards: string[][] = [];
    const runTask: RunTaskFn<null> = (task) => {
      seenShards.push((task.shard?.items ?? []).map((i) => i.id));
      return Promise.resolve({
        usage: { promptTokens: 1, candidatesTokens: 1, thoughtsTokens: 0, cachedTokens: 0 },
        value: null,
      });
    };
    const testPlan = plan([
      stage("s1", { fanout: { mode: "shard", count: 2, maxParallel: 2, shardKey: "file" } }),
    ]);
    await runScheduler({
      ledger,
      plan: testPlan,
      runTask,
      estimateWorstCase: () => 100,
      buildShardItems: () => [
        { id: "a", groupKey: "a" },
        { id: "b", groupKey: "b" },
      ],
    });
    expect(seenShards.flat().sort()).toEqual(["a", "b"]);
    expect(seenShards.every((s) => s.length === 1)).toBe(true); // disjoint — one item per shard here
  });
});
