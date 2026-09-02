import type { Gap, Outline } from "@ao/shared";

/** One Task's contribution into a reduction — PROTOCOLS.md §8's `TaskResult<I>`. */
export interface TaskResult<T> {
  taskId: string;
  value: T;
}

/** PROTOCOLS.md §8. `outline` is only consulted by reducers that need section order (`local:concat-ordered`); others ignore it. */
export interface ReduceContext {
  stageId: string;
  outline?: Outline;
}

/** PROTOCOLS.md §8's `ReduceOutcome<O>`. */
export interface ReduceOutcome<O> {
  value: O;
  gaps: Gap[];
  needsLlmStitch: boolean;
  stitchScope?: string[];
}

/** PROTOCOLS.md §8's `Reducer<I, O>`. Every `local:*` implementation in this directory is pure and synchronous — no network, no I/O, same input always produces a bit-for-bit identical output (P5-T10's own done-criterion). */
export type Reducer<I, O> = (inputs: readonly TaskResult<I>[], ctx: ReduceContext) => ReduceOutcome<O>;
