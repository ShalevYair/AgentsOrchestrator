import { describe, expect, it } from "vitest";
import { CalibrationStore, percentile90 } from "./calibration.js";
import type { CalibrationKey } from "./types.js";

const KEY: CalibrationKey = { agentType: "reader", thinkingLevel: "medium" };

describe("percentile90", () => {
  it("returns the last element for a small sorted array (nearest-rank)", () => {
    expect(percentile90([1, 2, 3, 4, 5])).toBe(5);
  });

  it("returns 1 for an empty array", () => {
    expect(percentile90([])).toBe(1);
  });

  it("picks the 90th-ranked value for a larger sample", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile90(sorted)).toBe(90);
  });
});

describe("CalibrationStore — P4-T6", () => {
  it("with zero samples, estimate() returns the worst-case hint unchanged", () => {
    const store = new CalibrationStore();
    expect(store.estimate(KEY, 8000)).toBe(8000);
    expect(store.sampleCount(KEY)).toBe(0);
  });

  it("from the second run onward, the reservation tightens", () => {
    const store = new CalibrationStore();
    // reader/medium consistently uses ~3000 of its 8000 worst-case allowance
    store.record(KEY, 8000, 3000);
    const secondRunEstimate = store.estimate(KEY, 8000);
    expect(secondRunEstimate).toBeLessThan(8000);
    expect(secondRunEstimate).toBeCloseTo(3000, -2);
  });

  it("never exceeds the hard-cap worst-case, even if actuals ran hotter than predicted", () => {
    const store = new CalibrationStore();
    store.record(KEY, 8000, 12_000); // actual blew past the theoretical worst case
    expect(store.estimate(KEY, 8000)).toBeLessThanOrEqual(8000);
  });

  it("computes the true p90 across a spread of samples, not just the mean or the max", () => {
    const store = new CalibrationStore();
    // Ten evenly spread ratios: 0.1, 0.2, ..., 1.0 — nearest-rank p90 of 10 values is the 9th-ranked one (0.9).
    for (let i = 1; i <= 10; i++) store.record(KEY, 10_000, i * 1000);
    expect(store.estimate(KEY, 10_000)).toBeCloseTo(9000, 0);
  });

  it("a single cheap outlier doesn't drag the reservation down to it — p90 stays driven by the bulk of samples", () => {
    const store = new CalibrationStore();
    for (let i = 0; i < 20; i++) store.record(KEY, 10_000, 8000); // consistently expensive
    store.record(KEY, 10_000, 100); // one unusually cheap call
    const estimate = store.estimate(KEY, 10_000);
    expect(estimate).toBeCloseTo(8000, -2);
  });

  it("keeps calibration keyed independently per (agentType, thinkingLevel)", () => {
    const store = new CalibrationStore();
    store.record({ agentType: "reader", thinkingLevel: "low" }, 4000, 1000);
    expect(store.estimate({ agentType: "reader", thinkingLevel: "high" }, 4000)).toBe(4000);
    expect(store.estimate({ agentType: "writer", thinkingLevel: "low" }, 4000)).toBe(4000);
  });

  it("ignores a zero worstCase sample rather than dividing by zero", () => {
    const store = new CalibrationStore();
    store.record(KEY, 0, 500);
    expect(store.sampleCount(KEY)).toBe(0);
  });

  it("bounds memory by dropping the oldest sample past maxSamplesPerKey", () => {
    const store = new CalibrationStore({ maxSamplesPerKey: 3 });
    store.record(KEY, 1000, 100);
    store.record(KEY, 1000, 200);
    store.record(KEY, 1000, 300);
    store.record(KEY, 1000, 400);
    expect(store.sampleCount(KEY)).toBe(3);
  });
});
