import { z } from "zod";
import { EvidenceRefSchema, FileEncodingSchema, FileOpSchema, Sha256Schema } from "./common.js";
import { ToolResultSchema } from "./local-tool.js";

export const FindingEnvelopeSchema = z.strictObject({
  t: z.literal("finding"),
  id: z.string().min(1),
  claim: z.string().min(1),
  tags: z.array(z.string()),
  evidence: z.array(EvidenceRefSchema),
  confidence: z.number().min(0).max(1),
});
export type FindingEnvelope = z.infer<typeof FindingEnvelopeSchema>;

export const NoteEnvelopeSchema = z.strictObject({
  t: z.literal("note"),
  text: z.string().min(1),
});
export type NoteEnvelope = z.infer<typeof NoteEnvelopeSchema>;

/** `what` is left open (not a closed enum) — the docs only ever show "context" as an example. */
export const NeedEnvelopeSchema = z.strictObject({
  t: z.literal("need"),
  what: z.string().min(1),
  query: z.string().min(1),
  why: z.string().min(1),
});
export type NeedEnvelope = z.infer<typeof NeedEnvelopeSchema>;

export const SectionEnvelopeSchema = z.strictObject({
  t: z.literal("section"),
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
});
export type SectionEnvelope = z.infer<typeof SectionEnvelopeSchema>;

export const FileBeginEnvelopeSchema = z.strictObject({
  t: z.literal("file_begin"),
  id: z.string().min(1),
  path: z.string().min(1),
  op: FileOpSchema,
  encoding: FileEncodingSchema,
});
export type FileBeginEnvelope = z.infer<typeof FileBeginEnvelopeSchema>;

export const FileChunkEnvelopeSchema = z.strictObject({
  t: z.literal("file_chunk"),
  id: z.string().min(1),
  seq: z.number().int().nonnegative(),
  data: z.string(),
});
export type FileChunkEnvelope = z.infer<typeof FileChunkEnvelopeSchema>;

export const FileEndEnvelopeSchema = z.strictObject({
  t: z.literal("file_end"),
  id: z.string().min(1),
  sha256: Sha256Schema,
  lines: z.number().int().nonnegative(),
});
export type FileEndEnvelope = z.infer<typeof FileEndEnvelopeSchema>;

export const SelfCheckSchema = z.strictObject({
  criteriaMet: z.array(z.string()),
  unmet: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type SelfCheck = z.infer<typeof SelfCheckSchema>;

export const DoneEnvelopeSchema = z.strictObject({
  t: z.literal("done"),
  summary: z.string().min(1),
  selfCheck: SelfCheckSchema,
});
export type DoneEnvelope = z.infer<typeof DoneEnvelopeSchema>;

/**
 * One line of an agent's NDJSON output (PROTOCOLS.md §3). The parser
 * (packages/core/parse/ndjson.ts, P5-T7) discards any line that fails
 * this union rather than failing the whole response — see rules 1-2 there.
 */
export const NdjsonEnvelopeSchema = z.discriminatedUnion("t", [
  FindingEnvelopeSchema,
  NoteEnvelopeSchema,
  NeedEnvelopeSchema,
  SectionEnvelopeSchema,
  FileBeginEnvelopeSchema,
  FileChunkEnvelopeSchema,
  FileEndEnvelopeSchema,
  DoneEnvelopeSchema,
  ToolResultSchema,
]);
export type NdjsonEnvelope = z.infer<typeof NdjsonEnvelopeSchema>;
