import { z } from "zod";

/**
 * P8-T5 — the seam-stitch LLM call's own output shape. Deliberately
 * narrow: a flat list of `{id, correctedBody}` pairs, one per section/file
 * the seam touches — there is no field here through which a response
 * could describe changes to anything outside the ids it was given, so a
 * caller checking "did the model only touch what I asked" is checking
 * actual returned ids against the requested scope, not trusting a promise
 * embedded in a bigger free-form document.
 */
export const SeamStitchSectionSchema = z.strictObject({
  id: z.string().min(1),
  correctedBody: z.string().min(1),
});
export type SeamStitchSection = z.infer<typeof SeamStitchSectionSchema>;

export const SeamStitchResponseSchema = z.strictObject({
  sections: z.array(SeamStitchSectionSchema).min(1),
});
export type SeamStitchResponse = z.infer<typeof SeamStitchResponseSchema>;
