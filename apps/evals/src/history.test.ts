import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendHistory,
  detectRegressions,
  loadHistory,
  resolveHistoryPath,
  toHistoryEntry,
  type HistoryEntry,
} from "./history.js";
import type { EvalCaseRunResult } from "./run-case.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-eval-history-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    caseId: "case-a",
    pass: true,
    tokensSpent: 1000,
    costUsd: 0.01,
    durationMs: 10,
    schemaViolations: 0,
    continuationAttempts: 0,
    cacheHitTokens: 0,
    criteriaMet: 1,
    criteriaUnmet: 0,
    ...overrides,
  };
}

function runResult(overrides: Partial<EvalCaseRunResult> = {}): EvalCaseRunResult {
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
    criteriaMet: 1,
    criteriaUnmet: 0,
    deliverableText: "some deliverable",
    planSource: "recipe",
    cancelled: false,
    stageActualTokens: {},
    ...overrides,
  };
}

describe("resolveHistoryPath", () => {
  it("resolves to <evalsDir>/history.jsonl", () => {
    expect(resolveHistoryPath(join("/foo", "evals"))).toBe(join("/foo", "evals", "history.jsonl"));
  });
});

describe("toHistoryEntry", () => {
  it("carries every metric field over from an EvalCaseRunResult", () => {
    const result = runResult({ id: "x", tokensSpent: 42, continuationAttempts: 2, criteriaUnmet: 1 });
    const converted = toHistoryEntry(result, "2026-01-01T00:00:00.000Z");
    expect(converted).toEqual({
      timestamp: "2026-01-01T00:00:00.000Z",
      caseId: "x",
      pass: true,
      tokensSpent: 42,
      costUsd: 0.01,
      durationMs: 10,
      schemaViolations: 0,
      continuationAttempts: 2,
      cacheHitTokens: 0,
      criteriaMet: 1,
      criteriaUnmet: 1,
    });
  });
});

describe("loadHistory / appendHistory", () => {
  it("returns an empty array when the file doesn't exist yet (first ever run)", () => {
    expect(loadHistory(join(dir, "history.jsonl"))).toEqual([]);
  });

  it("round-trips entries written by appendHistory", () => {
    const path = join(dir, "history.jsonl");
    appendHistory(path, [entry({ caseId: "a" }), entry({ caseId: "b" })]);
    expect(loadHistory(path).map((e) => e.caseId)).toEqual(["a", "b"]);
  });

  it("accumulates across multiple appendHistory calls (simulating multiple real pnpm eval runs)", () => {
    const path = join(dir, "history.jsonl");
    appendHistory(path, [entry({ caseId: "a", timestamp: "t1" })]);
    appendHistory(path, [entry({ caseId: "a", timestamp: "t2" })]);
    expect(loadHistory(path)).toHaveLength(2);
  });

  it("does nothing (no file created) for an empty entries array", () => {
    const path = join(dir, "history.jsonl");
    appendHistory(path, []);
    expect(loadHistory(path)).toEqual([]);
  });
});

describe("detectRegressions", () => {
  it("reports nothing for a case with no prior history (first run ever)", () => {
    const findings = detectRegressions([], [entry()]);
    expect(findings).toEqual([]);
  });

  it("reports nothing when every metric holds steady or improves", () => {
    const previous = [entry({ tokensSpent: 1000, durationMs: 10 })];
    const current = [entry({ tokensSpent: 900, durationMs: 5 })];
    expect(detectRegressions(previous, current)).toEqual([]);
  });

  it("flags a tokensSpent increase", () => {
    const previous = [entry({ tokensSpent: 1000 })];
    const current = [entry({ tokensSpent: 1200 })];
    const findings = detectRegressions(previous, current);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/tokensSpent regressed: 1000 -> 1200/);
  });

  it("flags a schemaViolations increase", () => {
    const previous = [entry({ schemaViolations: 0 })];
    const current = [entry({ schemaViolations: 1 })];
    const findings = detectRegressions(previous, current);
    expect(findings.some((f) => f.reason.includes("schemaViolations regressed"))).toBe(true);
  });

  it("flags pass -> fail", () => {
    const previous = [entry({ pass: true })];
    const current = [entry({ pass: false })];
    const findings = detectRegressions(previous, current);
    expect(findings.some((f) => f.reason.includes("now fails"))).toBe(true);
  });

  it("does not flag fail -> pass", () => {
    const previous = [entry({ pass: false })];
    const current = [entry({ pass: true })];
    expect(detectRegressions(previous, current)).toEqual([]);
  });

  it("flags a sharp (>3x) durationMs increase above the noise floor", () => {
    const previous = [entry({ durationMs: 20 })];
    const current = [entry({ durationMs: 100 })];
    const findings = detectRegressions(previous, current);
    expect(findings.some((f) => f.reason.includes("durationMs regressed sharply"))).toBe(true);
  });

  it("does not flag ordinary jitter on an already-tiny duration", () => {
    const previous = [entry({ durationMs: 2 })];
    const current = [entry({ durationMs: 9 })];
    expect(detectRegressions(previous, current)).toEqual([]);
  });

  it("compares against the most recent of several prior entries for the same case, not the oldest", () => {
    const previous = [
      entry({ timestamp: "t1", tokensSpent: 5000 }),
      entry({ timestamp: "t3", tokensSpent: 1000 }),
      entry({ timestamp: "t2", tokensSpent: 2000 }),
    ];
    const current = [entry({ tokensSpent: 1500 })];
    // Most recent (t3) was 1000; 1500 > 1000 is a real regression even
    // though 1500 < both older entries.
    const findings = detectRegressions(previous, current);
    expect(findings.some((f) => f.reason.includes("1000 -> 1500"))).toBe(true);
  });

  it("evaluates each case independently by caseId", () => {
    const previous = [entry({ caseId: "a", tokensSpent: 1000 }), entry({ caseId: "b", tokensSpent: 1000 })];
    const current = [entry({ caseId: "a", tokensSpent: 1200 }), entry({ caseId: "b", tokensSpent: 900 })];
    const findings = detectRegressions(previous, current);
    expect(findings.map((f) => f.caseId)).toEqual(["a"]);
  });
});
