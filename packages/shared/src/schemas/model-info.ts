import { z } from "zod";

/**
 * Normalized shape of a single model as reported by the *live* provider
 * catalog (Gemini's `models.list()`), independent of any SDK type. This is
 * deliberately thin: it carries only what is directly observable from the
 * live API (limits, which actions the model supports). Pricing and our own
 * `cheap`/`worker`/`synth` tier classification are curated knowledge, not
 * something the live API reports — those live in the model registry
 * (`packages/providers/src/models.ts`, P1-T7), not here.
 */
export const ModelInfoSchema = z.strictObject({
  id: z.string().min(1),
  displayName: z.string().min(1),
  contextWindowTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  supportsGenerate: z.boolean(),
  supportsCountTokens: z.boolean(),
  supportsCaching: z.boolean(),
  supportsThinking: z.boolean(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
