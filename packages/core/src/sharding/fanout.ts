import type { Fanout, FanoutMode } from "@ao/shared";
import { buildShards, type Shard, type ShardItem } from "./shard.js";

export interface TaskSpec {
  taskId: string;
  /** Set only for `shard` mode — the disjoint slice of work this Task exclusively owns. Every other mode hands every Task the Stage's full input, so there is nothing to slice. */
  shard?: Shard;
  /** Set only for `pipeline` mode (except its first Task) — the taskId whose output this Task consumes before doing its own pass. */
  pipelineDependsOn?: string;
  /** Set only for `pipeline` mode — this Task's 0-based position in the chain. */
  pipelinePosition?: number;
}

export interface FanoutPlan {
  mode: FanoutMode;
  tasks: TaskSpec[];
}

function taskId(stageId: string, index: number): string {
  return `${stageId}#${String(index)}`;
}

/**
 * P5-T5 — turns one Stage's `fanout` config into the concrete list of
 * Tasks to run, per ARCHITECTURE.md §4's 5 modes:
 *
 * - `shard`: map — `shardItems` is packed into disjoint, covering shards
 *   (`buildShards`), one Task per shard. `shardItems` is required (an
 *   empty/omitted list here is almost certainly a caller bug for a
 *   shard-mode Stage, but this function itself stays permissive — an empty
 *   `shardItems` just yields zero Tasks, matching `buildShards`).
 * - `ensemble` / `debate`: `fanout.count` independent Tasks, each gett ing
 *   the Stage's *entire* input (no partitioning at all) — the difference
 *   between the two is purely in how their outputs get reduced downstream
 *   (`local:vote` vs. a `critic` pass), not in how they're scheduled here.
 * - `pipeline`: `fanout.count` Tasks in a strict linear chain, each
 *   depending on the previous one's output (draft -> critique -> revise).
 * - `single`: exactly one Task with the full input, ignoring `fanout.count`
 *   (V6's plan validation already requires `count === 1` isn't enforced,
 *   but a `single` stage only ever needs one Task regardless of what
 *   `count` says).
 */
export function planFanout(
  stageId: string,
  fanout: Fanout,
  shardItems: readonly ShardItem[] = [],
): FanoutPlan {
  switch (fanout.mode) {
    case "shard": {
      const shards = buildShards(shardItems, fanout.count);
      return {
        mode: "shard",
        tasks: shards.map((shard) => ({ taskId: taskId(stageId, shard.index), shard })),
      };
    }
    case "ensemble":
    case "debate": {
      const tasks = Array.from({ length: fanout.count }, (_, index) => ({ taskId: taskId(stageId, index) }));
      return { mode: fanout.mode, tasks };
    }
    case "pipeline": {
      const tasks: TaskSpec[] = [];
      for (let index = 0; index < fanout.count; index++) {
        const spec: TaskSpec = { taskId: taskId(stageId, index), pipelinePosition: index };
        if (index > 0) spec.pipelineDependsOn = taskId(stageId, index - 1);
        tasks.push(spec);
      }
      return { mode: "pipeline", tasks };
    }
    case "single": {
      return { mode: "single", tasks: [{ taskId: taskId(stageId, 0) }] };
    }
    default: {
      const exhaustive: never = fanout.mode;
      return exhaustive;
    }
  }
}
