import { FindingEnvelopeSchema } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { buildAgentPrompt, buildOutputSpec, fillTemplate } from "./prompt.js";

describe("fillTemplate", () => {
  it("substitutes every known placeholder", () => {
    const result = fillTemplate("Goal: {{objective}}. Shard: {{shard}}.", {
      objective: "map the repo",
      shard: "packages/core",
    });
    expect(result).toBe("Goal: map the repo. Shard: packages/core.");
  });

  it("throws on a placeholder with no matching variable, instead of leaving it unresolved", () => {
    expect(() => fillTemplate("{{objective}} {{mystery}}", { objective: "x" })).toThrow(/mystery/);
  });

  it("is a no-op on a template with no placeholders", () => {
    expect(fillTemplate("plain text", {})).toBe("plain text");
  });
});

describe("buildOutputSpec", () => {
  it("derives a JSON Schema description from a live Zod schema", () => {
    const spec = buildOutputSpec(FindingEnvelopeSchema);
    const parsed: unknown = JSON.parse(spec);
    expect(parsed).toMatchObject({ type: "object" });
    expect(spec).toContain("claim");
  });

  it("is deterministic — the same schema always renders the same spec text", () => {
    expect(buildOutputSpec(FindingEnvelopeSchema)).toBe(buildOutputSpec(FindingEnvelopeSchema));
  });
});

describe("buildAgentPrompt", () => {
  const template = [
    "Objective: {{objective}}",
    "Shard: {{shard}}",
    "Contract: {{contract}}",
    "Evidence: {{evidence}}",
    "Success criteria:",
    "{{successCriteria}}",
    "Output shape:",
    "{{outputSpec}}",
  ].join("\n");

  it("fills every documented variable, including a derived outputSpec", () => {
    const filled = buildAgentPrompt(template, {
      objective: "find auth logic",
      shard: "src/auth/**",
      contract: "shared contract block",
      evidence: "retrieved snippet",
      successCriteria: ["at least one finding", "zero schema violations"],
      outputSchema: FindingEnvelopeSchema,
    });
    expect(filled).toContain("Objective: find auth logic");
    expect(filled).toContain("- at least one finding");
    expect(filled).toContain("- zero schema violations");
    expect(filled).toContain('"claim"');
    expect(filled).not.toMatch(/\{\{\w+\}\}/); // nothing left unresolved
  });

  it("keeps the prompt's stated contract synchronized with the actual validator (ADR-006)", () => {
    // Two different schemas must produce two different {{outputSpec}} renderings —
    // proving the prompt text is derived from whatever schema is actually
    // passed in, not a stale hand-written copy.
    const a = buildAgentPrompt("{{outputSpec}}", {
      objective: "",
      shard: "",
      contract: "",
      evidence: "",
      successCriteria: [],
      outputSchema: FindingEnvelopeSchema,
    });
    const b = buildAgentPrompt("{{outputSpec}}", {
      objective: "",
      shard: "",
      contract: "",
      evidence: "",
      successCriteria: [],
      outputSchema: FindingEnvelopeSchema.pick({ id: true, claim: true }),
    });
    expect(a).not.toBe(b);
  });
});
