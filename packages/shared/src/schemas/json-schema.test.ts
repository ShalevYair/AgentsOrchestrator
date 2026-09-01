import { describe, expect, it } from "vitest";
import { toJsonSchema } from "./json-schema.js";
import { CheckpointDecisionSchema } from "./checkpoint.js";
import { PlanSchema } from "./plan.js";
import { TaskUnderstandingSchema } from "./understanding.js";

/**
 * These three are the schemas actually sent as a Gemini responseSchema
 * (recon, planner, checkpoint each produce one JSON object, not a
 * streamed NDJSON sequence) — see PROTOCOLS.md §§1-2, 6. The exact
 * Gemini-dialect narrowing happens in P1-T2; this only proves the
 * underlying JSON Schema comes out correct and usable as a starting point.
 */
describe("toJsonSchema", () => {
  it.each([
    ["TaskUnderstandingSchema", TaskUnderstandingSchema],
    ["PlanSchema", PlanSchema],
    ["CheckpointDecisionSchema", CheckpointDecisionSchema],
  ] as const)("produces a well-formed object schema for %s", (_name, schema) => {
    const json = toJsonSchema(schema);
    expect(json["type"]).toBe("object");
    expect(json["properties"]).toBeTypeOf("object");
    expect(Array.isArray(json["required"])).toBe(true);
    expect((json["required"] as string[]).length).toBeGreaterThan(0);
  });

  it("round-trips required-ness: every required key in the JSON Schema is a required key on the Zod object", () => {
    const json = toJsonSchema(CheckpointDecisionSchema);
    expect(json["required"]).toEqual(expect.arrayContaining(["decision", "reason", "patch", "confidence"]));
  });

  it("does not silently degrade to an empty schema (the failure mode of the old zod-to-json-schema path against Zod v4)", () => {
    const json = toJsonSchema(TaskUnderstandingSchema);
    expect(Object.keys(json["properties"] as Record<string, unknown>).length).toBeGreaterThan(3);
  });
});
