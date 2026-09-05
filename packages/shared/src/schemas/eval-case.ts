import { z } from "zod";
import { BudgetLevelSchema } from "./common.js";
import { TaskUnderstandingSchema } from "./understanding.js";

/**
 * TASKS.md P11-T1 — one golden-task fixture: a real user request run
 * through the real recipe -> plan -> scheduler pipeline (the same chain
 * `apps/runtime/src/recipe-end-to-end.test.ts` already proved for P10-T5),
 * with the assertions that must hold made explicit and data-driven instead
 * of hardcoded per-recipe test bodies. `understanding` omits
 * `suggestedRecipe` on purpose — the runner sets it to `recipeName` itself
 * (`@ao/core`'s `planWithRecipe` only ever looks at `suggestedRecipe` to
 * decide which recipe to try), so a fixture can't drift out of sync by
 * naming a different recipe in the two places.
 */
export const EvalUnderstandingInputSchema = TaskUnderstandingSchema.omit({ suggestedRecipe: true });
export type EvalUnderstandingInput = z.infer<typeof EvalUnderstandingInputSchema>;

/**
 * Every threshold here is optional and omitted = not checked — a fixture
 * that only cares about the mechanical pipeline assertions (schema
 * violations, done, all-success; always checked, not part of this object)
 * doesn't have to invent a cost/time ceiling it can't yet justify.
 */
export const EvalAssertionsSchema = z.strictObject({
  /**
   * Ceiling on `TokenReport.grandTotalSpent` (`@ao/core`'s
   * `buildTokenReport`) for this case's execution ledger. This is the
   * simple absolute form of a cost check; P11-T5's "% more expensive than
   * a recorded baseline" regression gate is a separate, not-yet-built
   * mechanism layered on top of this same number, not a duplicate of it.
   */
  maxTokensSpent: z.number().int().positive().optional(),
  /**
   * Wall-clock ceiling in ms for the whole run. Every case runs against
   * `MockLLMProvider` (no real network), so this catches an accidental
   * hang/infinite loop, not a real performance SLA.
   */
  maxDurationMs: z.number().int().positive().optional(),
});
export type EvalAssertions = z.infer<typeof EvalAssertionsSchema>;

/**
 * P11-T2 — how much synthetic input the harness feeds a `shard`-mode
 * stage (more/fewer shard items; see `@ao/evals`'s `buildEvalShardItems`).
 * Only two values, matching P11-T2's own "two scales" wording exactly
 * (קלט גדול / large input); `understanding.deliverableShape.estimatedSize`
 * already covers the analogous *output*-size scale (large deliverable),
 * reused as-is rather than duplicated here. Optional and defaults to
 * `"small"` in the runner — every P11-T1 fixture predates this field and
 * still validates unchanged.
 */
export const InputScaleSchema = z.enum(["small", "large"]);
export type InputScale = z.infer<typeof InputScaleSchema>;

export const EvalCaseSchema = z.strictObject({
  /** Must match the `<id>.yaml` filename it's loaded from — same convention `RecipeSchema.name` already uses (`@ao/platform`'s `loadRecipe`). */
  id: z.string().min(1),
  description: z.string().min(1),
  /** Free-form labels for filtering a run (e.g. by size, domain, language) — no fixed enum, since P11-T2's actual coverage categories are still being decided as those fixtures get written. */
  tags: z.array(z.string().min(1)),
  /** Name of a recipe registered under `recipes/` (`@ao/platform`'s `listRecipeNames`) — this case's run always goes through the zero-LLM-call `planWithRecipe` recipe path, never the real LLM planner, so it stays deterministic and free to run in CI. */
  recipeName: z.string().min(1),
  userRequest: z.string().min(1),
  budgetTotal: z.number().int().positive(),
  budgetLevel: BudgetLevelSchema,
  understanding: EvalUnderstandingInputSchema,
  assertions: EvalAssertionsSchema,
  inputScale: InputScaleSchema.optional(),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;
