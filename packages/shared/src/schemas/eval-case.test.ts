import { describe, expect, it } from "vitest";
import { EvalCaseSchema, type EvalCase } from "./eval-case.js";

const EXAMPLE_CASE: EvalCase = {
  id: "repo-analysis-small-he",
  description: "ניתוח מאגר קטן בעברית — מקרה חלק לדוגמה",
  tags: ["small", "code", "analysis", "he"],
  recipeName: "repo-analysis",
  userRequest: "נתח את מבנה המאגר הזה וסכם את התלויות המרכזיות",
  budgetTotal: 1_000_000,
  budgetLevel: "standard",
  understanding: {
    intent: "analyze",
    deliverableShape: { kind: "markdown", estimatedSize: "medium", structure: "sectioned" },
    evidenceNeeds: [],
    acceptanceCriteria: ["מסמך מכסה תלויות מרכזיות"],
    ambiguities: [],
    riskFlags: [],
  },
  assertions: { maxTokensSpent: 50_000, maxDurationMs: 5000 },
};

describe("EvalCaseSchema", () => {
  it("parses a well-formed golden-task fixture", () => {
    const parsed = EvalCaseSchema.parse(EXAMPLE_CASE);
    expect(parsed.recipeName).toBe("repo-analysis");
    expect(parsed.assertions.maxTokensSpent).toBe(50_000);
  });

  it("accepts assertions with every threshold omitted", () => {
    expect(() => EvalCaseSchema.parse({ ...EXAMPLE_CASE, assertions: {} })).not.toThrow();
  });

  it("rejects a suggestedRecipe field inside understanding (the runner sets it, a fixture must not)", () => {
    const bad = { ...EXAMPLE_CASE, understanding: { ...EXAMPLE_CASE.understanding, suggestedRecipe: "x" } };
    expect(() => EvalCaseSchema.parse(bad)).toThrow();
  });

  it("rejects a negative maxTokensSpent", () => {
    const bad = { ...EXAMPLE_CASE, assertions: { maxTokensSpent: -1 } };
    expect(() => EvalCaseSchema.parse(bad)).toThrow();
  });

  it("rejects an unknown budgetLevel", () => {
    expect(() => EvalCaseSchema.parse({ ...EXAMPLE_CASE, budgetLevel: "extreme" })).toThrow();
  });

  it("rejects an empty tags entry", () => {
    expect(() => EvalCaseSchema.parse({ ...EXAMPLE_CASE, tags: [""] })).toThrow();
  });
});
