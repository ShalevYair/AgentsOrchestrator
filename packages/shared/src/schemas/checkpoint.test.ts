import { describe, expect, it } from "vitest";
import {
  CheckpointDecisionSchema,
  JsonPatchOperationSchema,
  isPatchPathAllowed,
  type CheckpointDecision,
} from "./checkpoint.js";

/** Verbatim from PROTOCOLS.md §6. */
const EXAMPLE_DECISION: CheckpointDecision = {
  decision: "amend",
  reason: "המודולים גדולים מהצפוי; 6 סוכנים יחרגו מהתקציב",
  patch: [
    { op: "replace", path: "/stages/2/fanout/count", value: 4 },
    { op: "replace", path: "/stages/2/contextBudget/maxInputTokens", value: 22000 },
  ],
  confidence: 0.8,
};

describe("CheckpointDecisionSchema", () => {
  it("parses the example from PROTOCOLS.md §6 verbatim", () => {
    const decision = CheckpointDecisionSchema.parse(EXAMPLE_DECISION);
    expect(decision.patch).toHaveLength(2);
  });

  it("accepts an empty patch for continue/stop decisions", () => {
    expect(() =>
      CheckpointDecisionSchema.parse({
        decision: "continue",
        reason: "on track",
        patch: [],
        confidence: 0.95,
      }),
    ).not.toThrow();
  });

  it("rejects a decision outside continue/amend/replan/stop", () => {
    expect(() => CheckpointDecisionSchema.parse({ ...EXAMPLE_DECISION, decision: "pause" })).toThrow();
  });
});

describe("JsonPatchOperationSchema (RFC 6902)", () => {
  it("parses all six standard operation kinds", () => {
    const ops = [
      { op: "add", path: "/stages/2", value: { id: "s9" } },
      { op: "remove", path: "/stages/2" },
      { op: "replace", path: "/stages/2/fanout/count", value: 4 },
      { op: "move", path: "/stages/3", from: "/stages/2" },
      { op: "copy", path: "/stages/3", from: "/stages/2" },
      { op: "test", path: "/stages/2/fanout/count", value: 6 },
    ];
    for (const op of ops) {
      expect(() => JsonPatchOperationSchema.parse(op), JSON.stringify(op)).not.toThrow();
    }
  });

  it("rejects a path that isn't a JSON Pointer", () => {
    expect(() =>
      JsonPatchOperationSchema.parse({ op: "replace", path: "stages.2.count", value: 1 }),
    ).toThrow();
  });

  it("rejects `remove` carrying a stray value field (strict per-op shape)", () => {
    expect(() => JsonPatchOperationSchema.parse({ op: "remove", path: "/stages/2", value: 1 })).toThrow();
  });
});

describe("isPatchPathAllowed", () => {
  it.each([
    "/stages/2/fanout/count",
    "/stages/2/fanout/maxParallel",
    "/stages/2/contextBudget/maxInputTokens",
    "/stages/2/contextBudget",
    "/stages/2/tokenBudget/hardCap",
    "/stages/2/agentType",
    "/stages/5",
  ])("allows %s (from the ✅ column of PROTOCOLS.md §6)", (path) => {
    expect(isPatchPathAllowed(path)).toBe(true);
  });

  it.each([
    "/budget/total",
    "/reserve/synthesisTokens",
    "/deliverables/1",
    "/stages/2/tokenBudget/estimatedIn",
    "/stages/2/onFailure",
    "/objective",
  ])("rejects %s (from the ❌ column of PROTOCOLS.md §6)", (path) => {
    expect(isPatchPathAllowed(path)).toBe(false);
  });
});
