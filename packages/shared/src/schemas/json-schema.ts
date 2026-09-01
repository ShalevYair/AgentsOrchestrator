import { z } from "zod";

/**
 * PROTOCOLS.md's "iron rule" names the third-party `zod-to-json-schema`
 * package as the conversion path. In practice (verified empirically while
 * building this) that package predates Zod v4's internal representation
 * and silently produces an empty `{}` schema against a v4 Zod object —
 * it would have broken every structured-output call. Zod v4 ships its own
 * `z.toJSONSchema()`, which produces correct output against the same
 * schemas, so this wrapper is the actual conversion path; there is no
 * other caller of z.toJSONSchema in the codebase.
 *
 * This produces standard JSON Schema (draft 2020-12) — e.g. optional
 * fields as a `["T", "null"]` type union. Narrowing that further into
 * Gemini's specific responseSchema dialect (no $schema, its own
 * nullable/type conventions) is P1-T2's job, once the provider call is
 * actually being wired up against verified, current API documentation.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema);
}
