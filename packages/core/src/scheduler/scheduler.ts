import type { Plan, Stage, Usage } from "@ao/shared";
import { admit, type Ledger } from "../ledger/index.js";
import { planFanout, type Shard, type ShardItem } from "../sharding/index.js";
import { runPool } from "./pool.js";
import { topologicalStageOrder } from "./topo.js";

export interface ScheduledTask {
  taskId: string;
  stageId: string;
  agentType: string;
  /** Present only for `shard`-mode Tasks (P5-T5). */
  shard?: Shard;
  /** Present only for `pipeline`-mode Tasks after the first in the chain. */
  pipelineDependsOn?: string;
  pipelinePosition?: number;
}

export interface TaskRunResult<T> {
  usage: Usage;
  modelId?: string;
  value: T;
}

/**
 * The caller-supplied "actually run one Task" function — real agent
 * invocation (agent-runner's prompt/request building, `collectGenerate`,
 * NDJSON parsing, continuation) is injected rather than performed by the
 * Scheduler itself, the same dependency-injection pattern already used for
 * `LLMProvider` throughout this package. `signal` is the run's cancellation
 * signal; an implementation that respects it and throws/rejects on abort
 * gets its Ledger reservation released automatically (see `runTaskOnce`
 * below) — no special-cased cancellation plumbing needed beyond that.
 */
export type RunTaskFn<T> = (task: ScheduledTask, signal: AbortSignal) => Promise<TaskRunResult<T>>;

export type TaskOutcomeStatus = "success" | "failed" | "budget-rejected" | "cancelled";

export interface TaskOutcome<T> {
  taskId: string;
  status: TaskOutcomeStatus;
  value?: T;
  error?: unknown;
}

export interface StageRunResult<T> {
  stageId: string;
  outcomes: TaskOutcome<T>[];
  /** P6-T6 — true when this Stage was skipped entirely because it already completed in a prior run/plan version and its output is preserved in the Blackboard (`options.skipStageIds`); `outcomes` is always `[]` in that case, and no Task in this Stage was ever admitted or run. Optional and simply absent (never `false`) for every Stage that actually ran, keeping this purely additive to P5-T4's existing shape. */
  skipped?: true;
}

export interface SchedulerRunResult<T> {
  stages: StageRunResult<T>[];
  /** True if the run stopped early because `signal` was aborted before every stage ran. */
  cancelled: boolean;
}

export interface RunSchedulerOptions<T> {
  ledger: Ledger;
  plan: Plan;
  runTask: RunTaskFn<T>;
  /** BUDGET.md §4.1's precomputed worst-case for one Task — `core` has no provider of its own to derive this from, same convention as every other admission call site in this package. */
  estimateWorstCase: (task: ScheduledTask) => number;
  /** Supplies `shard`-mode Stages their shardable items (P5-T5's `ShardItem[]`) — omit for a Plan with no `shard`-mode stages. */
  buildShardItems?: (stage: Stage) => ShardItem[];
  signal?: AbortSignal;
  /** An extra run-wide concurrency ceiling on top of each Stage's own `fanout.maxParallel` (BUDGET.md §1's goal-button cap). Omit for no additional ceiling beyond each Stage's own. */
  globalMaxParallel?: number;
  /** P6-T6 — stage ids to skip entirely (never admitted, never run) because they already completed in a prior run/plan version and their output survives in the Blackboard (`computeResumePoint`, P5-T12, generalized to a replanned DAG that may or may not still declare the same stage ids). Omit for a normal first-time run, where nothing is pre-completed. */
  skipStageIds?: ReadonlySet<string>;
}

async function runTaskOnce<T>(
  ledger: Ledger,
  stage: Stage,
  scheduledTask: ScheduledTask,
  runTask: RunTaskFn<T>,
  worstCase: number,
  signal: AbortSignal,
): Promise<TaskOutcome<T>> {
  // `admit()` (not `runAdmitted`) deliberately: a budget rejection at Task
  // granularity is ARCHITECTURE.md §10's Task-level failure policy
  // ("דילוג עם רישום פער" — skip with a recorded gap), not a run-ending
  // exception. This still reuses the exact same admit/settle/release
  // primitives `runAdmitted` is built from (P4-T3/T4) — nothing here
  // reimplements ledger admission logic, it only chooses to report a
  // rejection as a soft per-task outcome instead of throwing.
  const outcome = admit(ledger, {
    bucket: "execution",
    stageId: stage.id,
    agentType: stage.agentType,
    worstCase,
  });
  if (outcome.decision !== "approved") {
    return { taskId: scheduledTask.taskId, status: "budget-rejected", error: outcome.reason };
  }

  try {
    const result = await runTask(scheduledTask, signal);
    ledger.settle(outcome.reservation, result.usage, result.modelId);
    return { taskId: scheduledTask.taskId, status: "success", value: result.value };
  } catch (error) {
    // Covers both a genuine task failure and an aborted in-flight call
    // (an implementation that honors `signal` rejects when it fires) —
    // either way the reservation's `committed` hold is released here via
    // P4-T4's `Ledger.release()`, never left dangling. This is exactly
    // the "cancellation must not leak committed" property this task's
    // own done-criterion names.
    ledger.release(outcome.reservation);
    const status: TaskOutcomeStatus = signal.aborted ? "cancelled" : "failed";
    return { taskId: scheduledTask.taskId, status, error };
  }
}

/**
 * P5-T4 — executes a validated `Plan`'s Stages in topological order
 * (`topologicalStageOrder`), and within each Stage, its fan-out Tasks
 * (`planFanout`, P5-T5) with concurrency bounded by
 * `min(stage.fanout.maxParallel, globalMaxParallel ?? Infinity)`
 * (`runPool`, P5-T4's own property-tested bound). `pipeline`-mode Stages
 * always run their chain at concurrency 1 regardless of `maxParallel` —
 * a pipeline Task's whole point is consuming the previous Task's finished
 * output, so running two chain-adjacent Tasks concurrently would be
 * incoherent no matter what the declared ceiling says.
 *
 * Checks `signal.aborted` before starting each new Stage and before
 * launching each new Task within a Stage — a Task already in flight when
 * cancellation fires is left to `runTask` itself to notice and reject on,
 * at which point its reservation is released the normal way (see
 * `runTaskOnce`). No stage runs after the signal has fired; `cancelled`
 * reports whether that happened.
 *
 * `options.skipStageIds` (P6-T6) is checked before any of that for each
 * Stage in turn: a listed id is recorded as `{ outcomes: [], skipped: true }`
 * and the loop moves straight to the next Stage — no `admit()`, no
 * `runTask`, no Ledger spend at all for it.
 */
export async function runScheduler<T>(options: RunSchedulerOptions<T>): Promise<SchedulerRunResult<T>> {
  const order = topologicalStageOrder(options.plan.stages);
  const stageById = new Map(options.plan.stages.map((s) => [s.id, s]));
  const stages: StageRunResult<T>[] = [];
  let cancelled = false;
  const signal = options.signal ?? new AbortController().signal;

  for (const stageId of order) {
    if (signal.aborted) {
      cancelled = true;
      break;
    }
    const stage = stageById.get(stageId)!;
    if (options.skipStageIds?.has(stage.id)) {
      // P6-T6: never admitted, never run — this stage's Ledger cost was
      // already paid and its output already lives in the Blackboard from
      // whichever prior run/plan version completed it.
      stages.push({ stageId: stage.id, outcomes: [], skipped: true });
      continue;
    }
    const shardItems = options.buildShardItems ? options.buildShardItems(stage) : [];
    const fanoutPlan = planFanout(stage.id, stage.fanout, shardItems);

    const poolLimit =
      stage.fanout.mode === "pipeline"
        ? 1
        : Math.min(stage.fanout.maxParallel, options.globalMaxParallel ?? stage.fanout.maxParallel);

    const outcomes = await runPool(fanoutPlan.tasks, poolLimit, async (taskSpec) => {
      if (signal.aborted) {
        return { taskId: taskSpec.taskId, status: "cancelled" as const };
      }
      const scheduledTask: ScheduledTask = {
        taskId: taskSpec.taskId,
        stageId: stage.id,
        agentType: stage.agentType,
        ...(taskSpec.shard !== undefined ? { shard: taskSpec.shard } : {}),
        ...(taskSpec.pipelineDependsOn !== undefined
          ? { pipelineDependsOn: taskSpec.pipelineDependsOn }
          : {}),
        ...(taskSpec.pipelinePosition !== undefined ? { pipelinePosition: taskSpec.pipelinePosition } : {}),
      };
      const worstCase = options.estimateWorstCase(scheduledTask);
      return runTaskOnce(options.ledger, stage, scheduledTask, options.runTask, worstCase, signal);
    });

    stages.push({ stageId: stage.id, outcomes });
    if (signal.aborted) {
      cancelled = true;
      break;
    }
  }

  return { stages, cancelled };
}
