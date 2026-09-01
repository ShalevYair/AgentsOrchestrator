import { z } from "zod";
import { DeliverableKindSchema, ReadRungSchema } from "./common.js";

export const IntentSchema = z.enum(["answer", "analyze", "create", "modify", "research", "convert"]);
export type Intent = z.infer<typeof IntentSchema>;

export const DeliverableSizeSchema = z.enum(["small", "medium", "large", "xlarge"]);
export type DeliverableSize = z.infer<typeof DeliverableSizeSchema>;

export const DeliverableStructureSchema = z.enum(["atomic", "sectioned", "multi-file"]);
export type DeliverableStructure = z.infer<typeof DeliverableStructureSchema>;

export const DeliverableShapeSchema = z.strictObject({
  kind: DeliverableKindSchema,
  estimatedSize: DeliverableSizeSchema,
  structure: DeliverableStructureSchema,
});
export type DeliverableShape = z.infer<typeof DeliverableShapeSchema>;

export const EvidenceNeedSchema = z.strictObject({
  what: z.string().min(1),
  rung: ReadRungSchema,
  why: z.string().min(1),
});
export type EvidenceNeed = z.infer<typeof EvidenceNeedSchema>;

export const AmbiguityImpactSchema = z.enum(["low", "medium", "high"]);
export type AmbiguityImpact = z.infer<typeof AmbiguityImpactSchema>;

export const AmbiguitySchema = z.strictObject({
  question: z.string().min(1),
  assumption: z.string().min(1),
  impact: AmbiguityImpactSchema,
});
export type Ambiguity = z.infer<typeof AmbiguitySchema>;

/** The output contract of the `recon` agent (PROTOCOLS.md §2). */
export const TaskUnderstandingSchema = z.strictObject({
  intent: IntentSchema,
  deliverableShape: DeliverableShapeSchema,
  evidenceNeeds: z.array(EvidenceNeedSchema),
  acceptanceCriteria: z.array(z.string().min(1)),
  ambiguities: z.array(AmbiguitySchema),
  suggestedRecipe: z.string().min(1).nullable(),
  riskFlags: z.array(z.string().min(1)),
});
export type TaskUnderstanding = z.infer<typeof TaskUnderstandingSchema>;
