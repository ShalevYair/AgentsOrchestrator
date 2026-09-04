import type { Plan, Recipe, Stage } from "@ao/shared";

export interface InstantiateRecipeParams {
  recipe: Recipe;
  runId: string;
  /** The raw request text — the same value `ReconRequest.userRequest` (packages/core/recon) already carries — substituted into `recipe.objectiveTemplate`'s one `{{userRequest}}` placeholder. */
  userRequest: string;
  /** The run's real `budget.total` (BUDGET.md §1). Every `tokenBudgetShare`/`reserveShare` fraction in the recipe is scaled against this to produce real, run-specific absolute token counts. */
  budgetTotal: number;
}

const USER_REQUEST_PLACEHOLDER = "{{userRequest}}";

function fillObjective(template: string, userRequest: string): string {
  return template.split(USER_REQUEST_PLACEHOLDER).join(userRequest);
}

function scaleShare(share: number, budgetTotal: number): number {
  return Math.floor(share * budgetTotal);
}

/**
 * P10-T4 — turns a `Recipe` template plus this run's real budget/request
 * into a concrete `Plan`, with **no LLM call**: every number the recipe
 * expresses as a share of `budget.total` becomes a real absolute token
 * count here (arithmetic, not generation); everything else — `agentType`,
 * `fanout`, DAG shape, `mergeStrategy`, `successCriteria` — is already a
 * concrete, valid value inside the recipe itself, since a stage template
 * only ever omits what genuinely can't be known before a specific run
 * exists (PROTOCOLS.md §1's `Stage` minus exactly those fields).
 *
 * This is the entire cost saving TASKS.md's P10-T4 done-criterion asks
 * for: a matched recipe skips `runPlanner`'s `responseSchema: PlanSchema`
 * generation call (`thinkingLevel: "high"`, the single most expensive step
 * in the planning bucket) entirely, rather than merely shrinking it.
 *
 * Callers are still expected to run the result through `validatePlan`
 * (packages/core/plan/validate.ts) before using it — this function makes
 * no special claim to always produce a valid Plan (a badly-authored
 * recipe can still violate a V-check, e.g. shares that sum past 1); it
 * only does the mechanical filling, and validity is checked by the one
 * real Plan validator this package already has, not a second, parallel
 * notion of "valid" invented just for recipes.
 */
export function instantiateRecipe(params: InstantiateRecipeParams): Plan {
  const { recipe, runId, userRequest, budgetTotal } = params;

  const stages: Stage[] = recipe.stages.map((stageTemplate) => ({
    id: stageTemplate.id,
    name: stageTemplate.name,
    goal: stageTemplate.goal,
    dependsOn: stageTemplate.dependsOn,
    agentType: stageTemplate.agentType,
    fanout: stageTemplate.fanout,
    inputs: stageTemplate.inputs,
    outputContract: stageTemplate.outputContract,
    contextBudget: stageTemplate.contextBudget,
    tokenBudget: {
      estimatedIn: scaleShare(stageTemplate.tokenBudgetShare.estimatedInShare, budgetTotal),
      estimatedOut: scaleShare(stageTemplate.tokenBudgetShare.estimatedOutShare, budgetTotal),
      hardCap: scaleShare(stageTemplate.tokenBudgetShare.hardCapShare, budgetTotal),
    },
    mergeStrategy: stageTemplate.mergeStrategy,
    successCriteria: stageTemplate.successCriteria,
    onFailure: stageTemplate.onFailure,
    optional: stageTemplate.optional,
  }));

  return {
    version: 1,
    runId,
    objective: fillObjective(recipe.objectiveTemplate, userRequest),
    deliverables: recipe.deliverables,
    readPolicy: recipe.readPolicy,
    stages,
    reserve: {
      synthesisTokens: scaleShare(recipe.reserveShare.synthesisTokensShare, budgetTotal),
      repairTokens: scaleShare(recipe.reserveShare.repairTokensShare, budgetTotal),
    },
  };
}
