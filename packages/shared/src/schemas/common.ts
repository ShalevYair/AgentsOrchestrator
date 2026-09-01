import { z } from "zod";

/** The read-cost ladder from ARCHITECTURE.md §5.2 (R0 = free, R5 = full raw read). */
export const ReadRungSchema = z.enum(["R0", "R1", "R2", "R3", "R4", "R5"]);
export type ReadRung = z.infer<typeof ReadRungSchema>;

export const FanoutModeSchema = z.enum(["shard", "ensemble", "debate", "pipeline", "single"]);
export type FanoutMode = z.infer<typeof FanoutModeSchema>;

export const AgentTierSchema = z.enum(["cheap", "worker", "synth"]);
export type AgentTier = z.infer<typeof AgentTierSchema>;

export const ThinkingLevelSchema = z.enum(["low", "medium", "high"]);
export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;

/** The four goal-button levels from BUDGET.md §1. */
export const BudgetLevelSchema = z.enum(["draft", "standard", "deep", "custom"]);
export type BudgetLevel = z.infer<typeof BudgetLevelSchema>;

export const DeliverableKindSchema = z.enum(["markdown", "files", "data"]);
export type DeliverableKind = z.infer<typeof DeliverableKindSchema>;

export const FileOpSchema = z.enum(["create", "update", "delete", "rename"]);
export type FileOp = z.infer<typeof FileOpSchema>;

export const FileEncodingSchema = z.enum(["utf8", "base64"]);
export type FileEncoding = z.infer<typeof FileEncodingSchema>;

export const RunIdSchema = z.string().regex(/^run_[A-Za-z0-9]+$/, "runId must look like run_<id>");
export const StageIdSchema = z.string().min(1);
export const TaskIdSchema = z.string().min(1);

export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "expected a lowercase hex sha256 digest");

export const EvidenceRefSchema = z.strictObject({
  artifact: z.string().min(1),
  loc: z.string().min(1),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

/** Shared by Stage.outputContract (PROTOCOLS §1) and AgentDefinition.outputContract (§10). */
export const OutputContractSchema = z.strictObject({
  schemaRef: z.string().min(1),
  format: z.literal("ndjson"),
  maxOutputTokens: z.number().int().positive(),
});
export type OutputContract = z.infer<typeof OutputContractSchema>;

/** Gemini usageMetadata, normalized. See ARCHITECTURE.md §4.3. */
export const UsageSchema = z.strictObject({
  promptTokens: z.number().int().nonnegative(),
  candidatesTokens: z.number().int().nonnegative(),
  thoughtsTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof UsageSchema>;
