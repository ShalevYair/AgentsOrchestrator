import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkCostRegressions,
  COST_REGRESSION_THRESHOLD_PERCENT,
  loadCostBaseline,
  resolveCostBaselinePath,
  type CostBaseline,
} from "./cost-baseline.js";
import type { EvalCaseRunResult } from "./run-case.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-cost-baseline-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function result(overrides: Partial<EvalCaseRunResult> = {}): EvalCaseRunResult {
  return {
    id: "case-a",
    description: "desc",
    tags: [],
    pass: true,
    failures: [],
    durationMs: 10,
    tokensSpent: 1000,
    costUsd: 0.01,
    schemaViolations: 0,
    continuationAttempts: 0,
    cacheHitTokens: 0,
    criteriaMet: 0,
    criteriaUnmet: 0,
    deliverableText: "",
    planSource: "recipe",
    cancelled: false,
    stageActualTokens: {},
    ...overrides,
  };
}

describe("resolveCostBaselinePath", () => {
  it("resolves to <evalsDir>/cost-baseline.json", () => {
    expect(resolveCostBaselinePath("/foo/evals")).toBe("/foo/evals/cost-baseline.json");
  });
});

describe("loadCostBaseline", () => {
  it("returns an empty object when the file doesn't exist", () => {
    expect(loadCostBaseline(join(dir, "cost-baseline.json"))).toEqual({});
  });

  it("parses a real committed baseline file", () => {
    const path = join(dir, "cost-baseline.json");
    writeFileSync(path, JSON.stringify({ "case-a": { tokensSpent: 1000, costUsd: 0.01 } }));
    expect(loadCostBaseline(path)).toEqual({ "case-a": { tokensSpent: 1000, costUsd: 0.01 } });
  });

  it("throws on a baseline file that doesn't match the schema", () => {
    const path = join(dir, "cost-baseline.json");
    writeFileSync(path, JSON.stringify({ "case-a": { tokensSpent: "not a number" } }));
    expect(() => loadCostBaseline(path)).toThrow();
  });
});

describe("checkCostRegressions", () => {
  it("skips a case with no baseline entry (new case, nothing to compare against)", () => {
    const baseline: CostBaseline = {};
    expect(checkCostRegressions(baseline, [result()])).toEqual([]);
  });

  it("passes when tokensSpent is within the threshold", () => {
    const baseline: CostBaseline = { "case-a": { tokensSpent: 1000, costUsd: 0.01 } };
    const findings = checkCostRegressions(baseline, [result({ tokensSpent: 1200 })]);
    expect(findings).toEqual([]);
  });

  it("flags a case that exceeds the default 25% threshold", () => {
    const baseline: CostBaseline = { "case-a": { tokensSpent: 1000, costUsd: 0.01 } };
    const findings = checkCostRegressions(baseline, [result({ tokensSpent: 1300 })]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/30\.0% above baseline 1000/);
  });

  it("does not flag a decrease (cheaper is never a regression)", () => {
    const baseline: CostBaseline = { "case-a": { tokensSpent: 1000, costUsd: 0.01 } };
    expect(checkCostRegressions(baseline, [result({ tokensSpent: 500 })])).toEqual([]);
  });

  it("respects a custom threshold", () => {
    const baseline: CostBaseline = { "case-a": { tokensSpent: 1000, costUsd: 0.01 } };
    expect(checkCostRegressions(baseline, [result({ tokensSpent: 1100 })], 5)).toHaveLength(1);
    expect(checkCostRegressions(baseline, [result({ tokensSpent: 1100 })], 50)).toEqual([]);
  });

  it("evaluates multiple cases independently", () => {
    const baseline: CostBaseline = {
      "case-a": { tokensSpent: 1000, costUsd: 0.01 },
      "case-b": { tokensSpent: 2000, costUsd: 0.02 },
    };
    const findings = checkCostRegressions(baseline, [
      result({ id: "case-a", tokensSpent: 1300 }),
      result({ id: "case-b", tokensSpent: 2100 }),
    ]);
    expect(findings.map((f) => f.caseId)).toEqual(["case-a"]);
  });

  it("exports the documented default threshold", () => {
    expect(COST_REGRESSION_THRESHOLD_PERCENT).toBe(25);
  });
});
