import { NdjsonEnvelopeSchema } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { resolveOutputSchema } from "./schema-registry.js";

describe("resolveOutputSchema", () => {
  it("resolves the real NdjsonEnvelope schemaRef to the actual live schema every worker agent's output is parsed against", () => {
    expect(resolveOutputSchema("NdjsonEnvelope")).toBe(NdjsonEnvelopeSchema);
  });

  it("throws ConfigError on an unregistered schemaRef instead of silently returning something wrong", () => {
    expect(() => resolveOutputSchema("SomethingMadeUp")).toThrow(
      /unknown outputContract.schemaRef "SomethingMadeUp"/,
    );
  });
});
