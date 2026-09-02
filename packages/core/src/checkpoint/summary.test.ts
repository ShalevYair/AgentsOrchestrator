import { describe, expect, it } from "vitest";
import { NO_SIGNALS } from "./signals.js";
import {
  buildCheckpointStateSummary,
  DEFAULT_MAX_CHECKPOINT_SUMMARY_TOKENS,
  estimateTokensConservatively,
  type CheckpointStateSummaryInput,
} from "./summary.js";

function baseInput(overrides: Partial<CheckpointStateSummaryInput> = {}): CheckpointStateSummaryInput {
  return {
    stageId: "s2",
    stageName: "reading",
    signals: NO_SIGNALS,
    budget: { allocated: 1000, spent: 400, committed: 100, available: 500 },
    gaps: [],
    taskOutcomeCounts: { success: 3, failed: 0, budgetRejected: 0, cancelled: 0 },
    successCriteria: ["found the config module"],
    unmetCriteria: [],
    ...overrides,
  };
}

describe("estimateTokensConservatively", () => {
  it("is a conservative (over-)estimate — 2 chars per token", () => {
    expect(estimateTokensConservatively("ab")).toBe(1);
    expect(estimateTokensConservatively("abc")).toBe(2);
    expect(estimateTokensConservatively("")).toBe(0);
  });
});

describe("buildCheckpointStateSummary", () => {
  it("stays well under the cap for a normal-sized state", () => {
    const result = buildCheckpointStateSummary(baseInput());
    expect(result.estimatedTokens).toBeLessThan(DEFAULT_MAX_CHECKPOINT_SUMMARY_TOKENS);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain("s2");
  });

  it("never exceeds the cap even with thousands of gaps", () => {
    const gaps = Array.from({ length: 5000 }, (_, i) => ({
      description: `task-${String(i)} produced nothing`,
      reason: `some long-winded reason explaining exactly why task ${String(i)} failed to deliver anything usable this time around`,
      stageId: "s2",
    }));
    const result = buildCheckpointStateSummary(baseInput({ gaps }));
    expect(result.estimatedTokens).toBeLessThanOrEqual(DEFAULT_MAX_CHECKPOINT_SUMMARY_TOKENS);
    expect(result.truncated).toBe(true);
  });

  it("never exceeds a small custom cap", () => {
    const gaps = Array.from({ length: 200 }, (_, i) => ({
      description: `gap ${String(i)}`,
      reason: "reason",
      stageId: "s2",
    }));
    const result = buildCheckpointStateSummary(baseInput({ gaps }), 50);
    expect(result.estimatedTokens).toBeLessThanOrEqual(50);
  });

  it("respects the cap property across many random sizes", () => {
    for (const n of [0, 1, 3, 10, 50, 500, 3000]) {
      const gaps = Array.from({ length: n }, (_, i) => ({
        description: `gap number ${String(i)} with a moderately long description of what went wrong`,
        reason: "reason text here",
        stageId: "s2",
      }));
      const result = buildCheckpointStateSummary(baseInput({ gaps }));
      expect(result.estimatedTokens).toBeLessThanOrEqual(DEFAULT_MAX_CHECKPOINT_SUMMARY_TOKENS);
    }
  });

  it("lists fired signal names by key", () => {
    const result = buildCheckpointStateSummary(
      baseInput({ signals: { ...NO_SIGNALS, budgetDrift: true, needsPending: true } }),
    );
    expect(result.text).toContain("budgetDrift");
    expect(result.text).toContain("needsPending");
  });
});
