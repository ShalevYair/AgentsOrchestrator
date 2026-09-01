import { z } from "zod";
import { EvidenceRefSchema, Sha256Schema } from "./common.js";

export const FindingSchema = z.strictObject({
  id: z.string().min(1),
  stageId: z.string().min(1),
  claim: z.string().min(1),
  tags: z.array(z.string()),
  evidence: z.array(EvidenceRefSchema),
  confidence: z.number().min(0).max(1),
});
export type Finding = z.infer<typeof FindingSchema>;

export const BlackboardArtifactRefSchema = z.strictObject({
  id: z.string().min(1),
  path: z.string().min(1),
  sha256: Sha256Schema,
  stageId: z.string().min(1),
});
export type BlackboardArtifactRef = z.infer<typeof BlackboardArtifactRefSchema>;

export const DecisionSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
  rationale: z.string().min(1),
  stageId: z.string().min(1),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const OpenQuestionSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
  raisedBy: z.string().min(1),
  resolvedBy: z.string().min(1).nullable(),
});
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>;

/** `status` is left open — the docs show only one example value ("done"). */
export const OutlineSectionSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  ownerTaskId: z.string().min(1),
  status: z.string().min(1),
});
export type OutlineSection = z.infer<typeof OutlineSectionSchema>;

export const OutlineSchema = z.strictObject({
  id: z.string().min(1),
  sections: z.array(OutlineSectionSchema),
});
export type Outline = z.infer<typeof OutlineSchema>;

export const BlackboardSchema = z.strictObject({
  findings: z.array(FindingSchema),
  artifacts: z.array(BlackboardArtifactRefSchema),
  decisions: z.array(DecisionSchema),
  openQuestions: z.array(OpenQuestionSchema),
  outline: OutlineSchema,
});
export type Blackboard = z.infer<typeof BlackboardSchema>;

/**
 * Not shown as a JSON example anywhere in PROTOCOLS.md, but referenced by
 * name in two places (Reducers §8's ReduceOutcome.gaps, and the
 * run.finished event's `gaps` in §9) as "what's missing and why" — the
 * shape below is this project's own resolution of that gap, kept minimal
 * and matching the docs' own phrasing.
 */
export const GapSchema = z.strictObject({
  description: z.string().min(1),
  reason: z.string().min(1),
  stageId: z.string().min(1).optional(),
});
export type Gap = z.infer<typeof GapSchema>;
