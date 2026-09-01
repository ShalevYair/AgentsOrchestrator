import { describe, expect, it } from "vitest";
import { TaskUnderstandingSchema, type TaskUnderstanding } from "./understanding.js";

/** Verbatim from PROTOCOLS.md §2. */
const EXAMPLE_UNDERSTANDING: TaskUnderstanding = {
  intent: "analyze",
  deliverableShape: { kind: "markdown", estimatedSize: "large", structure: "sectioned" },
  evidenceNeeds: [
    { what: "מבנה המאגר", rung: "R1", why: "נדרש למיפוי גבולות" },
    { what: "מימוש שכבת האימות", rung: "R5", why: "צריך דיוק ברמת השורה" },
  ],
  acceptanceCriteria: ["..."],
  ambiguities: [{ question: "האם לכלול את חבילות הבדיקה?", assumption: "כן", impact: "medium" }],
  suggestedRecipe: "repo-analysis",
  riskFlags: ["large-input", "write-back-requested"],
};

describe("TaskUnderstandingSchema", () => {
  it("parses the example from PROTOCOLS.md §2 verbatim", () => {
    const u = TaskUnderstandingSchema.parse(EXAMPLE_UNDERSTANDING);
    expect(u.evidenceNeeds).toHaveLength(2);
    expect(u.ambiguities[0]?.impact).toBe("medium");
  });

  it("accepts a null suggestedRecipe, as the doc notes ('או null')", () => {
    expect(() =>
      TaskUnderstandingSchema.parse({ ...EXAMPLE_UNDERSTANDING, suggestedRecipe: null }),
    ).not.toThrow();
  });

  it("rejects an intent outside the closed vocabulary", () => {
    expect(() => TaskUnderstandingSchema.parse({ ...EXAMPLE_UNDERSTANDING, intent: "chat" })).toThrow();
  });

  it("rejects a deliverableShape.estimatedSize outside small/medium/large/xlarge", () => {
    const bad = structuredClone(EXAMPLE_UNDERSTANDING);
    (bad.deliverableShape as unknown as { estimatedSize: string }).estimatedSize = "huge";
    expect(() => TaskUnderstandingSchema.parse(bad as unknown)).toThrow();
  });
});
