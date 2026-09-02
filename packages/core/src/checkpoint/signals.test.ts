import { describe, expect, it } from "vitest";
import {
  anySignalFired,
  computeCheckpointSignals,
  NO_SIGNALS,
  type StageCheckpointSignalInput,
} from "./signals.js";

function baseInput(overrides: Partial<StageCheckpointSignalInput> = {}): StageCheckpointSignalInput {
  return {
    stage: { id: "s1", successCriteria: [] },
    reportedCriteriaMet: [],
    estimatedTokens: 1000,
    actualTokens: 1000,
    envelopeCounts: [3],
    ensembleContradiction: false,
    unresolvedNeedsCount: 0,
    anyTaskViolationRatioExceeded: false,
    ...overrides,
  };
}

describe("criteriaMissed", () => {
  it("does not fire when the stage declares no successCriteria", () => {
    const signals = computeCheckpointSignals(baseInput());
    expect(signals.criteriaMissed).toBe(false);
  });

  it("fires when a declared criterion is met by no task", () => {
    const input = baseInput({
      stage: { id: "s1", successCriteria: ["a", "b"] },
      reportedCriteriaMet: [["a"]],
    });
    expect(computeCheckpointSignals(input).criteriaMissed).toBe(true);
  });

  it("does not fire when criteria are covered across different tasks", () => {
    const input = baseInput({
      stage: { id: "s1", successCriteria: ["a", "b"] },
      reportedCriteriaMet: [["a"], ["b"]],
    });
    expect(computeCheckpointSignals(input).criteriaMissed).toBe(false);
  });
});

describe("budgetDrift", () => {
  it("does not fire under the 25% threshold", () => {
    const input = baseInput({ estimatedTokens: 1000, actualTokens: 1249 });
    expect(computeCheckpointSignals(input).budgetDrift).toBe(false);
  });

  it("fires strictly over the 25% threshold", () => {
    const input = baseInput({ estimatedTokens: 1000, actualTokens: 1251 });
    expect(computeCheckpointSignals(input).budgetDrift).toBe(true);
  });

  it("treats any positive actual against a zero estimate as drift", () => {
    const input = baseInput({ estimatedTokens: 0, actualTokens: 1 });
    expect(computeCheckpointSignals(input).budgetDrift).toBe(true);
  });

  it("does not fire when both estimate and actual are zero", () => {
    const input = baseInput({ estimatedTokens: 0, actualTokens: 0 });
    expect(computeCheckpointSignals(input).budgetDrift).toBe(false);
  });
});

describe("emptyOutput", () => {
  it("fires when any task produced zero envelopes", () => {
    const input = baseInput({ envelopeCounts: [5, 0, 2] });
    expect(computeCheckpointSignals(input).emptyOutput).toBe(true);
  });

  it("does not fire when every task produced at least one envelope", () => {
    const input = baseInput({ envelopeCounts: [1, 2, 3] });
    expect(computeCheckpointSignals(input).emptyOutput).toBe(false);
  });

  it("does not fire when there were no tasks to judge", () => {
    const input = baseInput({ envelopeCounts: [] });
    expect(computeCheckpointSignals(input).emptyOutput).toBe(false);
  });
});

describe("contradiction / needsPending / schemaViolations — direct passthrough", () => {
  it("mirrors ensembleContradiction", () => {
    expect(computeCheckpointSignals(baseInput({ ensembleContradiction: true })).contradiction).toBe(true);
  });

  it("fires needsPending only when the unresolved count is positive", () => {
    expect(computeCheckpointSignals(baseInput({ unresolvedNeedsCount: 0 })).needsPending).toBe(false);
    expect(computeCheckpointSignals(baseInput({ unresolvedNeedsCount: 2 })).needsPending).toBe(true);
  });

  it("mirrors anyTaskViolationRatioExceeded", () => {
    expect(
      computeCheckpointSignals(baseInput({ anyTaskViolationRatioExceeded: true })).schemaViolations,
    ).toBe(true);
  });
});

describe("anySignalFired", () => {
  it("is false for NO_SIGNALS", () => {
    expect(anySignalFired(NO_SIGNALS)).toBe(false);
  });

  it("is false when every computed signal is false", () => {
    expect(anySignalFired(computeCheckpointSignals(baseInput()))).toBe(false);
  });

  it("is true when exactly one signal fires", () => {
    expect(anySignalFired(computeCheckpointSignals(baseInput({ unresolvedNeedsCount: 1 })))).toBe(true);
  });
});
