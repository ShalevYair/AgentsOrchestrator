import { z } from "zod";
import { FileEncodingSchema, FileOpSchema, Sha256Schema } from "./common.js";

/**
 * The record ArtifactWriter keeps for every file it staged (PROTOCOLS.md §4).
 * Assembled locally from file_begin/file_chunk/file_end envelopes — this is
 * not itself streamed by an agent.
 */
export const FileEnvelopeSchema = z.strictObject({
  path: z.string().min(1),
  op: FileOpSchema,
  encoding: FileEncodingSchema,
  sha256: Sha256Schema,
  sizeBytes: z.number().int().nonnegative(),
  producedBy: z.strictObject({
    stageId: z.string().min(1),
    taskId: z.string().min(1),
  }),
  renameFrom: z.string().min(1).nullable(),
});
export type FileEnvelope = z.infer<typeof FileEnvelopeSchema>;
