import type { Reducer, TaskResult } from "./types.js";

/**
 * `llm:synthesize` (PROTOCOLS.md §8) — "מוצא אחרון. נרשם מפורשות ודורש
 * תקציב מ-reserve". This is the one reducer id that is NOT `local:*`, and
 * P5-T10's "pure and deterministic" done-criterion deliberately doesn't
 * apply to it (PROTOCOLS.md §8 itself draws that exact line: "כל reducer
 * שאינו llm:* חייב להיות טהור ודטרמיניסטי").
 *
 * It still can't itself call a provider, though — `packages/core` stays
 * I/O-free (README's own constraint), and this project's own stack (the
 * `LLMProvider`/`Ledger`/`runAdmitted` machinery in `continuation.ts`)
 * already knows how to make a real, budgeted call. So this function's job
 * is narrower and honest about it: it always reports `needsLlmStitch: true`
 * with the full `stitchScope`, and returns `fallbackValue`'s result as a
 * placeholder `value` for a caller that wants *something* to show before
 * the real stitch call (driven separately, by whoever owns the reserve
 * budget) actually resolves.
 */
export function makeLlmSynthesizeReducer<I, O>(
  fallbackValue: (inputs: readonly TaskResult<I>[]) => O,
): Reducer<I, O> {
  return (inputs, ctx) => ({
    value: fallbackValue(inputs),
    gaps: [
      {
        description: "final synthesis requires an LLM stitch that has not run yet",
        reason: "local reduction alone cannot combine these results — see PROTOCOLS.md §8's llm:synthesize",
        stageId: ctx.stageId,
      },
    ],
    needsLlmStitch: true,
    stitchScope: inputs.map((r) => r.taskId),
  });
}
