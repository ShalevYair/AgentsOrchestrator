import { CheckpointDecisionSchema, PlanSchema, TaskUnderstandingSchema } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toGeminiSchema } from "./schema-dialect.js";

describe("toGeminiSchema", () => {
  it.each([
    ["TaskUnderstandingSchema", TaskUnderstandingSchema],
    ["PlanSchema", PlanSchema],
    ["CheckpointDecisionSchema", CheckpointDecisionSchema],
  ] as const)("narrows %s to a well-formed OBJECT schema with no $schema key", (_name, schema) => {
    const gemini = toGeminiSchema(schema);
    expect(gemini.type).toBe("OBJECT");
    expect(gemini.properties).toBeTypeOf("object");
    expect(gemini.required?.length).toBeGreaterThan(0);
    expect(gemini).not.toHaveProperty("$schema");
    expect(JSON.stringify(gemini)).not.toContain("$schema");
    expect(JSON.stringify(gemini)).not.toContain("additionalProperties");
  });

  it("uses Gemini's Type enum values, not lowercase JSON Schema type strings", () => {
    const gemini = toGeminiSchema(TaskUnderstandingSchema);
    expect(gemini.properties?.["intent"]?.type).toBe("STRING");
    expect(gemini.properties?.["evidenceNeeds"]?.type).toBe("ARRAY");
    expect(gemini.properties?.["evidenceNeeds"]?.items?.type).toBe("OBJECT");
  });

  it("folds a nullable field's null branch into `nullable: true` and inlines the remaining type", () => {
    const gemini = toGeminiSchema(TaskUnderstandingSchema);
    const suggestedRecipe = gemini.properties?.["suggestedRecipe"];
    expect(suggestedRecipe?.type).toBe("STRING");
    expect(suggestedRecipe?.nullable).toBe(true);
    // The null branch must not survive as a literal anyOf member.
    expect(suggestedRecipe?.anyOf).toBeUndefined();
  });

  it("folds a discriminated union (oneOf, from z.discriminatedUnion) into anyOf, since Gemini's Schema has no oneOf", () => {
    const gemini = toGeminiSchema(CheckpointDecisionSchema);
    const patchItems = gemini.properties?.["patch"]?.items;
    expect(patchItems?.anyOf).toBeDefined();
    expect(patchItems?.anyOf?.length).toBe(6);
    // No branch should carry a raw `oneOf`/`const` leftover.
    for (const branch of patchItems?.anyOf ?? []) {
      expect(branch.type).toBe("OBJECT");
    }
  });

  it("converts a literal (`const`) into a one-element `enum`, since Gemini's Schema has no `const` field", () => {
    const gemini = toGeminiSchema(CheckpointDecisionSchema);
    const addBranch = gemini.properties?.["patch"]?.items?.anyOf?.find((b) =>
      b.properties?.["op"]?.enum?.includes("add"),
    );
    expect(addBranch).toBeDefined();
    expect(addBranch?.properties?.["op"]?.enum).toEqual(["add"]);
    expect(addBranch?.properties?.["op"]?.type).toBe("STRING");
  });

  it("emits minLength/maxItems etc. as strings (Gemini's protobuf-int64-as-string convention), not numbers", () => {
    const gemini = toGeminiSchema(PlanSchema);
    const objective = gemini.properties?.["objective"];
    expect(objective?.minLength).toBe("1");
    expect(typeof objective?.minLength).toBe("string");
    const deliverables = gemini.properties?.["deliverables"];
    expect(deliverables?.minItems).toBe("1");
  });

  it("drops exclusiveMinimum/exclusiveMaximum rather than mistranslating them (Gemini's Schema has no such field)", () => {
    const Probe = z.strictObject({ n: z.number().int().positive() });
    const gemini = toGeminiSchema(Probe);
    const n = gemini.properties?.["n"];
    expect(n?.type).toBe("INTEGER");
    expect(n).not.toHaveProperty("exclusiveMinimum");
    expect(n).not.toHaveProperty("minimum");
  });

  it("passes minimum/maximum through as numbers when present (unlike the string-typed length/count fields)", () => {
    const gemini = toGeminiSchema(TaskUnderstandingSchema);
    const confidence = toGeminiSchema(CheckpointDecisionSchema).properties?.["confidence"];
    expect(confidence?.minimum).toBe(0);
    expect(confidence?.maximum).toBe(1);
    expect(typeof confidence?.minimum).toBe("number");
    expect(gemini).toBeDefined();
  });

  it("populates propertyOrdering from the object's own key order", () => {
    const gemini = toGeminiSchema(CheckpointDecisionSchema);
    expect(gemini.propertyOrdering).toEqual(["decision", "reason", "patch", "confidence"]);
  });

  it("preserves a regex pattern (JSON Pointer path validation) since Gemini's Schema does support `pattern`", () => {
    const gemini = toGeminiSchema(CheckpointDecisionSchema);
    const addBranch = gemini.properties?.["patch"]?.items?.anyOf?.find((b) =>
      b.properties?.["op"]?.enum?.includes("add"),
    );
    expect(addBranch?.properties?.["path"]?.pattern).toBeTruthy();
  });

  it("never emits $ref or $defs (schemas are inlined, since Gemini's dialect has no $ref support)", () => {
    const serialized = JSON.stringify(toGeminiSchema(PlanSchema));
    expect(serialized).not.toContain("$ref");
    expect(serialized).not.toContain("$defs");
  });
});
