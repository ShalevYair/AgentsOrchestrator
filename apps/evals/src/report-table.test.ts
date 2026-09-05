import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printReportTable, type JudgedEvalCaseRunResult } from "./report-table.js";

function result(overrides: Partial<JudgedEvalCaseRunResult> = {}): JudgedEvalCaseRunResult {
  return {
    id: "case-a",
    description: "desc",
    tags: ["small"],
    pass: true,
    failures: [],
    durationMs: 10,
    tokensSpent: 100,
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
    judgeScore: 0,
    judgeTokensSpent: 0,
    ...overrides,
  };
}

let tableSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("printReportTable", () => {
  it("prints one table row per result, in order", () => {
    printReportTable([result({ id: "a" }), result({ id: "b" })]);

    expect(tableSpy).toHaveBeenCalledTimes(1);
    expect(tableSpy).toHaveBeenCalledWith([
      expect.objectContaining({ case: "a" }),
      expect.objectContaining({ case: "b" }),
    ]);
  });

  it("reports all-passed when every result passes", () => {
    printReportTable([result()]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("all 1 case(s) passed"));
  });

  it("lists each failing case's failure reasons when at least one fails", () => {
    printReportTable([
      result({ id: "ok" }),
      result({ id: "broken", pass: false, failures: ["reason one", "reason two"] }),
    ]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("1 of 2 case(s) failed"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("broken:"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason one"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason two"));
  });

  it("sums tokens/cost/time/cache-hits across all results into the totals line", () => {
    printReportTable([
      result({ tokensSpent: 100, costUsd: 0.01, durationMs: 10, cacheHitTokens: 5 }),
      result({ tokensSpent: 200, costUsd: 0.02, durationMs: 20, cacheHitTokens: 7 }),
    ]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("tokens: 300"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("$0.0300"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("30ms"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("cache hits: 12 tokens"));
  });

  it("includes continuations and criteria in each table row", () => {
    printReportTable([result({ continuationAttempts: 2, criteriaMet: 3, criteriaUnmet: 1 })]);

    expect(tableSpy).toHaveBeenCalledWith([expect.objectContaining({ continuations: 2, criteria: "3/4" })]);
  });

  it("says nothing about regressions when none are passed in", () => {
    printReportTable([result()]);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("regression"));
  });

  it("lists every regression finding when some are passed in", () => {
    printReportTable(
      [result()],
      [
        { caseId: "case-a", reason: "tokensSpent regressed: 100 -> 200" },
        { caseId: "case-b", reason: "now fails" },
      ],
    );

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("2 regression(s) detected"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("case-a: tokensSpent regressed: 100 -> 200"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("case-b: now fails"));
  });

  it("says nothing about cost regressions when none are passed in", () => {
    printReportTable([result()]);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("cost regression"));
  });

  it("lists every cost regression finding when some are passed in", () => {
    printReportTable(
      [result()],
      [],
      [{ caseId: "case-a", reason: "tokensSpent 1300 is 30.0% above baseline 1000" }],
    );

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("1 cost regression(s) detected"));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("case-a: tokensSpent 1300 is 30.0% above baseline 1000"),
    );
  });
});
