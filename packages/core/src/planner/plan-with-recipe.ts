import type { Recipe } from "@ao/shared";
import { validatePlan, type PlanValidationIssue } from "../plan/index.js";
import { instantiateRecipe } from "../recipes/index.js";
import { runPlanner, type PlannerResult, type RunPlannerParams } from "./planner.js";

export interface PlanWithRecipeParams extends Omit<RunPlannerParams, "recipes"> {
  /**
   * Every currently-registered recipe, already loaded off disk by the
   * caller (`@ao/platform`'s `listRecipeNames`/`loadRecipe`), keyed by
   * `Recipe.name` — this function does the actual *selection* itself
   * (`understanding.suggestedRecipe` lookup), which is pure/in-memory, not
   * I/O; only the loading is the composition root's job, same split as
   * every other registry in this package (P10-T1's agent registry, note
   * for note). `undefined`/`{}` behaves exactly like having no recipes at
   * all — always falls back to `runPlanner`.
   */
  recipeRegistry?: Readonly<Record<string, Recipe>>;
  runId: string;
  /** The raw request text — the same value `ReconRequest.userRequest` (packages/core/recon) already carries — becomes `Plan.objective` via the matched recipe's `objectiveTemplate` when a recipe is used. */
  userRequest: string;
}

export interface PlanWithRecipeResult extends PlannerResult {
  /**
   * `"recipe"` when `understanding.suggestedRecipe` matched a real
   * registered recipe and it instantiated into a `Plan` that passed the
   * same `validatePlan` every LLM-produced plan already goes through
   * (P5-T1) — zero LLM calls, the entire cost saving TASKS.md's P10-T4
   * done-criterion asks for. `"planner"` whenever `runPlanner` actually
   * ran: no recipe was suggested, the suggested one isn't registered, or
   * the instantiated plan didn't validate for this run's real budget/level
   * (a recipe never gets a silent pass the LLM path's own repair loop
   * wouldn't also have to earn).
   */
  source: "recipe" | "planner";
  /**
   * Present only when a recipe was actually matched by name but its
   * instantiated `Plan` failed `validatePlan` for this run — the specific
   * reason the fallback below happened, instead of a silent, indistinguishable
   * "recipe wasn't tried" (a badly-authored recipe, or one authored against
   * a different budget shape than this run's, should be diagnosable from
   * this result directly, not just from re-deriving it by hand).
   */
  recipeValidationIssues?: PlanValidationIssue[];
}

/**
 * TASKS.md P10-T4 — "מתכונים... נבחרות ע"י ה-planner... מתכון תואם חוסך את
 * רוב עלות התכנון" (recipes... selected by the planner... a matching
 * recipe saves most of the planning cost). Tries the recipe recon already
 * suggested first (`instantiateRecipe`, pure arithmetic, no LLM call), and
 * only calls the real `runPlanner` — the expensive `thinkingLevel: "high"`
 * generation this whole task exists to let a matched recipe skip — when
 * there's no usable match.
 */
export async function planWithRecipe(params: PlanWithRecipeParams): Promise<PlanWithRecipeResult> {
  const { recipeRegistry, runId, userRequest, ...plannerParams } = params;
  const suggestedName = params.understanding.suggestedRecipe;
  const matchedRecipe = suggestedName ? recipeRegistry?.[suggestedName] : undefined;
  let recipeValidationIssues: PlanValidationIssue[] | undefined;

  if (matchedRecipe) {
    const candidate = instantiateRecipe({
      recipe: matchedRecipe,
      runId,
      userRequest,
      budgetTotal: params.validationContext.budgetTotal,
    });
    const validation = validatePlan(candidate, params.validationContext);
    if (validation.valid && validation.plan) {
      return { plan: validation.plan, attempts: [], source: "recipe" };
    }
    recipeValidationIssues = validation.issues;
  }

  const recipeNames = recipeRegistry ? Object.keys(recipeRegistry).sort() : [];
  const plannerResult = await runPlanner(
    recipeNames.length > 0 ? { ...plannerParams, recipes: recipeNames } : plannerParams,
  );
  return {
    ...plannerResult,
    source: "planner",
    ...(recipeValidationIssues !== undefined ? { recipeValidationIssues } : {}),
  };
}
