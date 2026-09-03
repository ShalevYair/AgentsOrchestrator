import { describe, expect, it } from "vitest";
import { OutlineSpecSchema, type OutlineSpec } from "./outline-spec.js";

const EXAMPLE: OutlineSpec = {
  id: "outline-1",
  sections: [
    {
      id: "sec-1",
      title: "Intro",
      goal: "explain the problem",
      deliverableKind: "markdown",
      expectedOutputTokens: 4000,
    },
    {
      id: "sec-2",
      title: "src/index.ts",
      goal: "entry point",
      deliverableKind: "files",
      path: "src/index.ts",
      expectedOutputTokens: 6000,
    },
  ],
};

describe("OutlineSpecSchema", () => {
  it("parses a mixed markdown+files outline", () => {
    const parsed = OutlineSpecSchema.parse(EXAMPLE);
    expect(parsed.sections).toHaveLength(2);
  });

  it("rejects a files section with no path", () => {
    const bad = structuredClone(EXAMPLE);
    delete (bad.sections[1] as Record<string, unknown>)["path"];
    expect(() => OutlineSpecSchema.parse(bad)).toThrow();
  });

  it("rejects a markdown section that carries a path (discriminated union closes that door)", () => {
    const bad = structuredClone(EXAMPLE) as { sections: Record<string, unknown>[] };
    bad.sections[0]!["path"] = "not-allowed.md";
    expect(() => OutlineSpecSchema.parse(bad)).toThrow();
  });

  it("rejects a non-positive expectedOutputTokens", () => {
    const bad = structuredClone(EXAMPLE);
    bad.sections[0]!.expectedOutputTokens = 0;
    expect(() => OutlineSpecSchema.parse(bad)).toThrow();
  });

  it("rejects an outline with zero sections", () => {
    expect(() => OutlineSpecSchema.parse({ id: "outline-1", sections: [] })).toThrow();
  });

  it("rejects an unknown deliverableKind", () => {
    const bad = structuredClone(EXAMPLE) as { sections: Record<string, unknown>[] };
    bad.sections[0]!["deliverableKind"] = "data";
    expect(() => OutlineSpecSchema.parse(bad)).toThrow();
  });
});
