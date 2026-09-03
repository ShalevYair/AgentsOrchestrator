import { describe, expect, it } from "vitest";
import { estimateCostUsd, formatTokenCount, formatUsd } from "./cost.js";

describe("estimateCostUsd", () => {
  // BUDGET.md §1's own worked examples — this is the regression check that
  // ties the UI's live estimate back to the numbers the doc promises.
  it.each([
    [500_000, 0.7],
    [2_500_000, 3.4],
    [5_000_000, 6.8],
  ])("matches BUDGET.md §1's table for %i tokens", (tokens, expectedUsd) => {
    const cost = estimateCostUsd(tokens);
    expect(cost).not.toBeNull();
    expect(Number(cost?.toFixed(1))).toBeCloseTo(expectedUsd, 1);
  });

  it("scales linearly with token count", () => {
    const cost1 = estimateCostUsd(1_000_000);
    const cost2 = estimateCostUsd(2_000_000);
    expect(cost1).not.toBeNull();
    expect(cost2).not.toBeNull();
    if (cost1 === null || cost2 === null) return;
    expect(cost2).toBeCloseTo(cost1 * 2, 6);
  });

  it("returns null for an unknown model id", () => {
    expect(estimateCostUsd(1_000_000, "not-a-real-model")).toBeNull();
  });

  it("returns 0 for 0 tokens", () => {
    expect(estimateCostUsd(0)).toBe(0);
  });
});

describe("formatUsd", () => {
  it("shows cents below $10", () => {
    expect(formatUsd(0.7)).toBe("$0.70");
    expect(formatUsd(3.4)).toBe("$3.40");
  });

  it("shows one decimal at or above $10", () => {
    expect(formatUsd(12.34)).toBe("$12.3");
  });
});

describe("formatTokenCount", () => {
  it("formats millions", () => {
    expect(formatTokenCount(5_000_000)).toBe("5M");
    expect(formatTokenCount(2_500_000)).toBe("2.5M");
    expect(formatTokenCount(1_600_000)).toBe("1.6M");
  });

  it("formats thousands", () => {
    expect(formatTokenCount(500_000)).toBe("500K");
    expect(formatTokenCount(1_500)).toBe("1.5K");
  });

  it("formats small counts verbatim", () => {
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(0)).toBe("0");
  });
});
