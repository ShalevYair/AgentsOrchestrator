import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printReportTable } from "./report-table.js";
import type { EvalCaseRunResult } from "./run-case.js";

function result(overrides: Partial<EvalCaseRunResult> = {}): EvalCaseRunResult {
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
    planSource: "recipe",
    cancelled: false,
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

  it("sums tokens/cost/time across all results into the totals line", () => {
    printReportTable([
      result({ tokensSpent: 100, costUsd: 0.01, durationMs: 10 }),
      result({ tokensSpent: 200, costUsd: 0.02, durationMs: 20 }),
    ]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("tokens: 300"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("$0.0300"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("30ms"));
  });
});
