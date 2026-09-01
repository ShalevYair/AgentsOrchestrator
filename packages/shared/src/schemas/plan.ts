import { z } from "zod";
import {
  DeliverableKindSchema,
  FanoutModeSchema,
  OutputContractSchema,
  ReadRungSchema,
  RunIdSchema,
  StageIdSchema,
} from "./common.js";
import { ReducerIdSchema } from "./reducer.js";

export const DeliverableTargetSchema = z.enum(["chat", "staging", "folder"]);
export type DeliverableTarget = z.infer<typeof DeliverableTargetSchema>;

export const DeliverableSchema = z.strictObject({
  id: z.string().min(1),
  kind: DeliverableKindSchema,
  target: DeliverableTargetSchema,
  acceptance: z.array(z.string().min(1)),
});
export type Deliverable = z.infer<typeof DeliverableSchema>;

export const ReadPolicySchema = z.strictObject({
  maxRung: ReadRungSchema,
  fullReadAllowlist: z.array(z.string()),
  summarizeIf: z.strictObject({
    minRelevance: z.number().min(0).max(1),
    maxFiles: z.number().int().positive(),
  }),
});
export type ReadPolicy = z.infer<typeof ReadPolicySchema>;

export const FanoutSchema = z.strictObject({
  mode: FanoutModeSchema,
  count: z.number().int().positive(),
  maxParallel: z.number().int().positive(),
  /** Required in practice when mode is "shard"; enforced by V-series plan validation (P5-T1), not here. */
  shardKey: z.string().min(1).optional(),
});
export type Fanout = z.infer<typeof FanoutSchema>;

/**
 * `from` is either a static source ("artifacts" | "blackboard") or the id
 * of a stage earlier in the DAG. Both shapes are plain non-empty strings,
 * so we don't over-constrain here — V5 (P5-T1) is what actually resolves
 * the reference against the DAG.
 */
export const StageInputSchema = z.strictObject({
  from: z.string().min(1),
  select: z.string().min(1),
});
export type StageInput = z.infer<typeof StageInputSchema>;

export const StageContextBudgetSchema = z.strictObject({
  maxInputTokens: z.number().int().positive(),
  cacheContract: z.boolean(),
});
export type StageContextBudget = z.infer<typeof StageContextBudgetSchema>;

export const TokenBudgetSchema = z.strictObject({
  estimatedIn: z.number().int().nonnegative(),
  estimatedOut: z.number().int().nonnegative(),
  hardCap: z.number().int().positive(),
});
export type TokenBudget = z.infer<typeof TokenBudgetSchema>;

export const StageFailurePolicySchema = z.enum(["retry", "degrade", "replan", "skip"]);
export type StageFailurePolicy = z.infer<typeof StageFailurePolicySchema>;

export const StageSchema = z.strictObject({
  id: StageIdSchema,
  name: z.string().min(1),
  goal: z.string().min(1),
  dependsOn: z.array(StageIdSchema),
  agentType: z.string().min(1),
  fanout: FanoutSchema,
  inputs: z.array(StageInputSchema),
  outputContract: OutputContractSchema,
  contextBudget: StageContextBudgetSchema,
  tokenBudget: TokenBudgetSchema,
  mergeStrategy: ReducerIdSchema,
  successCriteria: z.array(z.string().min(1)),
  onFailure: StageFailurePolicySchema,
  optional: z.boolean(),
});
export type Stage = z.infer<typeof StageSchema>;

export const ReserveSchema = z.strictObject({
  synthesisTokens: z.number().int().nonnegative(),
  repairTokens: z.number().int().nonnegative(),
});
export type Reserve = z.infer<typeof ReserveSchema>;

/**
 * The static plan document itself carries no `budget.total` — that value
 * comes from the Run's goal-button config (BUDGET.md §1) and is passed
 * alongside the Plan into the V1-V8 validators (packages/core/plan/validate.ts,
 * P5-T1), not embedded in the plan.
 */
export const PlanSchema = z.strictObject({
  version: z.number().int().positive(),
  runId: RunIdSchema,
  objective: z.string().min(1),
  deliverables: z.array(DeliverableSchema).min(1),
  readPolicy: ReadPolicySchema,
  stages: z.array(StageSchema).min(1),
  reserve: ReserveSchema,
});
export type Plan = z.infer<typeof PlanSchema>;
