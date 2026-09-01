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
 * nullable/type conventions) is done in
 * `packages/providers/src/gemini/schema-dialect.ts` (P1-T2), verified
 * against the actual `Schema` type shipped in `@google/genai`.
 *
 * `params` passes straight through to `z.toJSONSchema` — P1-T2 uses
 * `{ reused: "inline" }` so a schema reused across multiple places (e.g.
 * `ReadRungSchema`, referenced from both `Stage` and `TaskUnderstanding`)
 * is inlined rather than emitted as a `$ref`/`$defs` pair, since Gemini's
 * responseSchema dialect has no `$ref` support to narrow that into.
 */
export function toJsonSchema(
  schema: z.ZodType,
  params?: Parameters<typeof z.toJSONSchema>[1],
): Record<string, unknown> {
  return z.toJSONSchema(schema, params);
}
