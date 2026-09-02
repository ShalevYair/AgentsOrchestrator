import type { Fanout } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { planFanout } from "./fanout.js";
import type { ShardItem } from "./shard.js";

describe("planFanout — shard mode", () => {
  it("produces one Task per shard, each owning its own disjoint slice", () => {
    const items: ShardItem[] = [
      { id: "a", path: "src/a.ts", groupKey: "a" },
      { id: "b", path: "src/b.ts", groupKey: "b" },
    ];
    const fanout: Fanout = { mode: "shard", count: 2, maxParallel: 2, shardKey: "module" };
    const plan = planFanout("s1", fanout, items);
    expect(plan.mode).toBe("shard");
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0]?.taskId).toBe("s1#0");
    expect(
      plan.tasks
        .flatMap((t) => t.shard?.items ?? [])
        .map((i) => i.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });
});

describe("planFanout — ensemble/debate", () => {
  it("produces N independent Tasks, each with no shard (full input)", () => {
    for (const mode of ["ensemble", "debate"] as const) {
      const fanout: Fanout = { mode, count: 3, maxParallel: 3 };
      const plan = planFanout("s1", fanout);
      expect(plan.tasks).toHaveLength(3);
      expect(plan.tasks.every((t) => t.shard === undefined)).toBe(true);
      expect(plan.tasks.map((t) => t.taskId)).toEqual(["s1#0", "s1#1", "s1#2"]);
    }
  });
});

describe("planFanout — pipeline", () => {
  it("chains Tasks with each depending on the previous one", () => {
    const fanout: Fanout = { mode: "pipeline", count: 3, maxParallel: 1 };
    const plan = planFanout("s1", fanout);
    expect(plan.tasks).toHaveLength(3);
    expect(plan.tasks[0]?.pipelineDependsOn).toBeUndefined();
    expect(plan.tasks[1]?.pipelineDependsOn).toBe("s1#0");
    expect(plan.tasks[2]?.pipelineDependsOn).toBe("s1#1");
    expect(plan.tasks.map((t) => t.pipelinePosition)).toEqual([0, 1, 2]);
  });
});

describe("planFanout — single", () => {
  it("always produces exactly one Task regardless of count", () => {
    const fanout: Fanout = { mode: "single", count: 5, maxParallel: 1 };
    const plan = planFanout("s1", fanout);
    expect(plan.tasks).toEqual([{ taskId: "s1#0" }]);
  });
});
