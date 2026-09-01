import { z } from "zod";
import { AgentTierSchema, FanoutModeSchema, OutputContractSchema, ThinkingLevelSchema } from "./common.js";

/**
 * Distinct from Stage.contextBudget (plan.ts) despite the shared name —
 * PROTOCOLS.md §10's agent.json example uses default/max, while §1's Plan
 * stage uses maxInputTokens/cacheContract. Conflating them would be wrong.
 */
export const AgentContextBudgetSchema = z.strictObject({
  default: z.number().int().positive(),
  max: z.number().int().positive(),
});
export type AgentContextBudget = z.infer<typeof AgentContextBudgetSchema>;

/** The shape of agents/<type>/agent.json (PROTOCOLS.md §10). */
export const AgentDefinitionSchema = z.strictObject({
  type: z.string().min(1),
  displayName: z.string().min(1),
  tier: AgentTierSchema,
  thinkingLevel: ThinkingLevelSchema,
  outputContract: OutputContractSchema,
  contextBudget: AgentContextBudgetSchema,
  supportsFanout: z.array(FanoutModeSchema),
  requiredInputs: z.array(z.string().min(1)),
  promptFile: z.string().min(1),
  temperature: z.number().min(0).max(2),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
