import { z } from "zod";
import { OutputContractSchema, StageIdSchema } from "./common.js";
import {
  DeliverableSchema,
  FanoutSchema,
  ReadPolicySchema,
  StageContextBudgetSchema,
  StageFailurePolicySchema,
  StageInputSchema,
} from "./plan.js";
import { ReducerIdSchema } from "./reducer.js";

/**
 * A `Stage` template (PROTOCOLS.md §1's `Stage`, minus the parts that can
 * only be known for a *specific* run): `tokenBudget` is expressed as a share
 * of the run's real `budget.total` instead of absolute numbers (a recipe is
 * authored once, reused at any budget level), and `goal` is fixed prose —
 * unlike `agent.md`'s `{{objective}}`, a recipe's stages already know their
 * own fixed role in this fixed pipeline; only the top-level `Recipe.objectiveTemplate`
 * needs the real run's request substituted in.
 */
export const RecipeStageTemplateSchema = z.strictObject({
  id: StageIdSchema,
  name: z.string().min(1),
  goal: z.string().min(1),
  dependsOn: z.array(StageIdSchema),
  agentType: z.string().min(1),
  fanout: FanoutSchema,
  inputs: z.array(StageInputSchema),
  outputContract: OutputContractSchema,
  contextBudget: StageContextBudgetSchema,
  /** Fractions of `budget.total`, scaled to real absolute `tokenBudget` numbers at instantiation (`instantiateRecipe`) — this is what lets one recipe validate at "draft"'s 500K tokens and "deep"'s much larger ceiling alike, per V2 (packages/core/plan/validate.ts). */
  tokenBudgetShare: z.strictObject({
    estimatedInShare: z.number().min(0).max(1),
    estimatedOutShare: z.number().min(0).max(1),
    hardCapShare: z.number().positive().max(1),
  }),
  mergeStrategy: ReducerIdSchema,
  successCriteria: z.array(z.string().min(1)),
  onFailure: StageFailurePolicySchema,
  optional: z.boolean(),
});
export type RecipeStageTemplate = z.infer<typeof RecipeStageTemplateSchema>;

/** `Plan.reserve`, also expressed as budget-total shares — see `RecipeStageTemplateSchema`'s own comment. */
export const RecipeReserveShareSchema = z.strictObject({
  synthesisTokensShare: z.number().min(0).max(1),
  repairTokensShare: z.number().min(0).max(1),
});
export type RecipeReserveShare = z.infer<typeof RecipeReserveShareSchema>;

/**
 * `agents/<type>/agent.json`'s counterpart for plan templates
 * (PROTOCOLS.md §10-adjacent, TASKS.md P10-T4): a whole `Plan` shape minus
 * the handful of fields that can only be known for one specific run
 * (`runId`, real budget numbers, the user's actual request text).
 * `TaskUnderstanding.suggestedRecipe` (recon's own output, already real —
 * see `understanding.ts`) is matched against `Recipe.name` by whoever calls
 * `instantiateRecipe`; this schema doesn't encode matching logic itself,
 * only the template's shape, same separation `AgentDefinitionSchema` draws
 * between "what a definition is" and "how one gets picked."
 */
export const RecipeSchema = z.strictObject({
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  /** May contain `{{userRequest}}` — the one placeholder `instantiateRecipe` fills, from the same raw text `ReconRequest.userRequest` already carries. */
  objectiveTemplate: z.string().min(1),
  readPolicy: ReadPolicySchema,
  deliverables: z.array(DeliverableSchema).min(1),
  stages: z.array(RecipeStageTemplateSchema).min(1),
  reserveShare: RecipeReserveShareSchema,
});
export type Recipe = z.infer<typeof RecipeSchema>;
