import { describe, expect, it } from "vitest";
import { BlackboardSchema, type Blackboard } from "./blackboard.js";

/** Verbatim from PROTOCOLS.md §7. */
const EXAMPLE_BLACKBOARD: Blackboard = {
  findings: [{ id: "f1", stageId: "s1", claim: "...", tags: [], evidence: [], confidence: 0.8 }],
  artifacts: [{ id: "w1", path: "...", sha256: "c".repeat(64), stageId: "s3" }],
  decisions: [{ id: "dec1", text: "נבחר Fastify", rationale: "...", stageId: "s2" }],
  openQuestions: [{ id: "q1", text: "...", raisedBy: "s1", resolvedBy: null }],
  outline: { id: "o1", sections: [{ id: "sec-1", title: "...", ownerTaskId: "s4#0", status: "done" }] },
};

describe("BlackboardSchema", () => {
  it("parses the example from PROTOCOLS.md §7 verbatim", () => {
    const bb = BlackboardSchema.parse(EXAMPLE_BLACKBOARD);
    expect(bb.findings[0]?.confidence).toBe(0.8);
    expect(bb.openQuestions[0]?.resolvedBy).toBeNull();
  });

  it("accepts a resolved open question (resolvedBy set)", () => {
    const bb = structuredClone(EXAMPLE_BLACKBOARD);
    bb.openQuestions[0]!.resolvedBy = "s2";
    expect(() => BlackboardSchema.parse(bb)).not.toThrow();
  });

  it("rejects an artifact ref with a bad sha256", () => {
    const bb = structuredClone(EXAMPLE_BLACKBOARD);
    bb.artifacts[0]!.sha256 = "nope";
    expect(() => BlackboardSchema.parse(bb)).toThrow();
  });
});
