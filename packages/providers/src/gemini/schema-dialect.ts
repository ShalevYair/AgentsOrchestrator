import { toJsonSchema } from "@ao/shared";
import type { z } from "zod";

/**
 * Narrows standard JSON Schema (draft 2020-12, as produced by
 * `@ao/shared`'s `toJsonSchema` / Zod v4's native `z.toJSONSchema()`) into
 * the actual `Schema` dialect Gemini's `responseSchema` field expects.
 *
 * Verified against the real `Schema` interface shipped in `@google/genai`
 * (`node_modules/@google/genai/dist/genai.d.ts`, package version 2.20.0,
 * fetched live from the npm registry while building this) — not recalled
 * from training or guessed from the OpenAPI-3.0-subset description in
 * Gemini's docs pages, which the network sandbox in this environment could
 * not reach (`ai.google.dev` and `googleapis.github.io` are both blocked by
 * the egress proxy here — see the P1 report for the full list of what was
 * and wasn't independently verifiable). The concrete, load-bearing
 * differences from standard JSON Schema, each confirmed against that `.d.ts`
 * and by running `z.toJSONSchema()` against this repo's actual PROTOCOLS.md
 * schemas (Plan / TaskUnderstanding / CheckpointDecision):
 *
 * 1. No `$schema` key — Gemini's dialect doesn't have one; we simply never copy it.
 * 2. `type` is the string enum `Type` (`"STRING" | "NUMBER" | "INTEGER" |
 *    "BOOLEAN" | "ARRAY" | "OBJECT" | "NULL"`), not JSON Schema's lowercase
 *    `"string" | "object" | ...`.
 * 3. Nullable/optional-with-null fields are standard JSON Schema's
 *    `anyOf: [T, {type:"null"}]` (confirmed: this is what Zod v4 emits for
 *    `.nullable()`, not a `["T","null"]` type array as PROTOCOLS.md's own
 *    prose summary suggested) — Gemini has no such union convention at all;
 *    it uses a plain `nullable: boolean` flag on the (single) type. We fold
 *    the null branch into `nullable: true` and inline the remaining branch.
 * 4. A `oneOf` (Zod v4 emits this for `z.discriminatedUnion`, e.g. the JSON
 *    Patch operation union in `CheckpointDecisionSchema.patch`) has no
 *    Gemini-dialect equivalent — the `Schema` interface only declares
 *    `anyOf`, so we fold `oneOf` into `anyOf` too.
 * 5. A literal (`const: "add"`) becomes a one-element `enum: ["add"]` —
 *    Gemini's `Schema` has no `const` field.
 * 6. `minLength` / `maxLength` / `minItems` / `maxItems` / `minProperties`
 *    / `maxProperties` are typed as **strings** on Gemini's `Schema`
 *    (`maxItems?: string`, etc. — a protobuf int64-as-string convention),
 *    while `minimum` / `maximum` stay plain `number`. Easy to miss because
 *    JSON Schema emits all six as numbers; verified directly against the
 *    `.d.ts`, not assumed to follow `minimum`'s convention.
 * 7. `exclusiveMinimum` / `exclusiveMaximum` (Zod emits these for
 *    `.positive()` etc.) have no Gemini equivalent at all — no
 *    `exclusiveMinimum` field exists on `Schema`. We drop them rather than
 *    approximate; this only weakens a *hint* to the model, since every
 *    agent output is re-validated against the real Zod schema regardless
 *    of what the API was told to prefer.
 * 8. `additionalProperties` has no Gemini-dialect equivalent either — dropped.
 * 9. `propertyOrdering` (Gemini-only, not standard JSON Schema at all) is
 *    populated from the object's own key order, since Gemini docs describe
 *    output quality as sensitive to it for some models.
 */

export type GeminiType = "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN" | "ARRAY" | "OBJECT" | "NULL";

export interface GeminiSchema {
  type?: GeminiType;
  description?: string;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  propertyOrdering?: string[];
  items?: GeminiSchema;
  enum?: string[];
  nullable?: boolean;
  pattern?: string;
  minLength?: string;
  maxLength?: string;
  minItems?: string;
  maxItems?: string;
  minProperties?: string;
  maxProperties?: string;
  minimum?: number;
  maximum?: number;
  anyOf?: GeminiSchema[];
}

const JSON_TYPE_TO_GEMINI: Readonly<Record<string, GeminiType>> = {
  string: "STRING",
  number: "NUMBER",
  integer: "INTEGER",
  boolean: "BOOLEAN",
  array: "ARRAY",
  object: "OBJECT",
  null: "NULL",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === "string");
  return strings.length > 0 ? strings : undefined;
}

/** Narrows a single already-resolved JSON Schema node (no `$ref` — callers pass `{ reused: "inline" }`). */
function narrowNode(node: unknown): GeminiSchema {
  if (!isRecord(node)) return {};

  const unionBranches = Array.isArray(node["anyOf"])
    ? (node["anyOf"] as unknown[])
    : Array.isArray(node["oneOf"])
      ? (node["oneOf"] as unknown[])
      : undefined;
  if (unionBranches) {
    const nullIndex = unionBranches.findIndex((b) => isRecord(b) && b["type"] === "null");
    const nonNull = unionBranches.filter((_, i) => i !== nullIndex);
    const nullable = nullIndex !== -1;
    let result: GeminiSchema;
    if (nonNull.length === 1) {
      result = narrowNode(nonNull[0]);
      if (nullable) result.nullable = true;
    } else {
      result = { anyOf: nonNull.map((b) => narrowNode(b)) };
      if (nullable) result.nullable = true;
    }
    if (typeof node["description"] === "string") result.description = node["description"];
    return result;
  }

  const out: GeminiSchema = {};

  const rawType = node["type"];
  if (typeof rawType === "string") {
    const mapped = JSON_TYPE_TO_GEMINI[rawType];
    if (mapped) out.type = mapped;
  } else if (Array.isArray(rawType)) {
    // Array.isArray narrows `unknown` to `any[]` in lib.d.ts — reassert as unknown[] to keep this safe.
    const typeArray: unknown[] = rawType;
    const nonNullTypes = typeArray.filter((t) => t !== "null");
    if (typeArray.includes("null")) out.nullable = true;
    const first = nonNullTypes[0];
    const mapped =
      nonNullTypes.length === 1 && typeof first === "string" ? JSON_TYPE_TO_GEMINI[first] : undefined;
    if (mapped) out.type = mapped;
  }

  if (typeof node["description"] === "string") out.description = node["description"];

  const enumValues = stringArray(node["enum"]);
  if (enumValues) {
    out.enum = enumValues;
  } else if (typeof node["const"] === "string") {
    out.enum = [node["const"]];
    out.type ??= "STRING";
  }

  if (isRecord(node["properties"])) {
    const props = node["properties"];
    const outProps: Record<string, GeminiSchema> = {};
    const order: string[] = [];
    for (const [key, value] of Object.entries(props)) {
      outProps[key] = narrowNode(value);
      order.push(key);
    }
    out.properties = outProps;
    out.propertyOrdering = order;
  }

  const required = stringArray(node["required"]);
  if (required) out.required = required;

  if (node["items"] !== undefined) out.items = narrowNode(node["items"]);

  if (typeof node["pattern"] === "string") out.pattern = node["pattern"];

  if (typeof node["minLength"] === "number") out.minLength = String(node["minLength"]);
  if (typeof node["maxLength"] === "number") out.maxLength = String(node["maxLength"]);
  if (typeof node["minItems"] === "number") out.minItems = String(node["minItems"]);
  if (typeof node["maxItems"] === "number") out.maxItems = String(node["maxItems"]);
  if (typeof node["minProperties"] === "number") out.minProperties = String(node["minProperties"]);
  if (typeof node["maxProperties"] === "number") out.maxProperties = String(node["maxProperties"]);
  if (typeof node["minimum"] === "number") out.minimum = node["minimum"];
  if (typeof node["maximum"] === "number") out.maximum = node["maximum"];
  // exclusiveMinimum / exclusiveMaximum: deliberately dropped, see point 7 above.

  return out;
}

/** Converts a Zod schema directly to Gemini's `responseSchema` dialect. */
export function toGeminiSchema(schema: z.ZodType): GeminiSchema {
  const json = toJsonSchema(schema, { reused: "inline" });
  return narrowNode(json);
}
