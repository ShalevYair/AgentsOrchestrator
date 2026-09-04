import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalCaseRunResult } from "./run-case.js";

/**
 * TASKS.md P11-T3 — "נשמרים לאורך זמן" (saved over time): one line per
 * `(timestamp, caseId)` pair, appended to `<evalsDir>/history.jsonl` by
 * every `pnpm eval` run and committed to the repo like any other tracked
 * file — so "over time" spans real commits, not just this one process's
 * lifetime. `detectRegressions` (below) is what reads this back to catch
 * a regression automatically, per that same done-criterion's other half.
 */
export interface HistoryEntry {
  timestamp: string;
  caseId: string;
  pass: boolean;
  tokensSpent: number;
  costUsd: number;
  durationMs: number;
  schemaViolations: number;
  continuationAttempts: number;
  cacheHitTokens: number;
  criteriaMet: number;
  criteriaUnmet: number;
}

export function resolveHistoryPath(evalsDir: string): string {
  return join(evalsDir, "history.jsonl");
}

export function toHistoryEntry(result: EvalCaseRunResult, timestamp: string): HistoryEntry {
  return {
    timestamp,
    caseId: result.id,
    pass: result.pass,
    tokensSpent: result.tokensSpent,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    schemaViolations: result.schemaViolations,
    continuationAttempts: result.continuationAttempts,
    cacheHitTokens: result.cacheHitTokens,
    criteriaMet: result.criteriaMet,
    criteriaUnmet: result.criteriaUnmet,
  };
}

/** Missing file (first ever run) is not an error — an empty history, not a crash. */
export function loadHistory(path: string): HistoryEntry[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as HistoryEntry);
}

export function appendHistory(path: string, entries: readonly HistoryEntry[]): void {
  if (entries.length === 0) return;
  const lines = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  appendFileSync(path, lines, "utf8");
}

export interface RegressionFinding {
  caseId: string;
  reason: string;
}

/**
 * Durations are real wall-clock time (GC, scheduling jitter), not a pure
 * function of the case's content the way token counts are — a 3x jump is
 * needed, and only above a small floor, so ordinary noise on an
 * already-tiny (a few ms) duration never reports a false regression.
 */
const DURATION_REGRESSION_MULTIPLIER = 3;
const DURATION_REGRESSION_FLOOR_MS = 50;

/**
 * Compares this run's entries against the most recent prior entry for the
 * same `caseId` in `previousHistory` (a case with no prior entry — its
 * first run ever — has nothing to regress against, so it's skipped, not
 * flagged). Every check here is a real "got worse" comparison — tokens
 * and schema violations are fully deterministic under `MockLLMProvider`,
 * so any increase at all is worth surfacing, not just one past some
 * tolerance band.
 */
export function detectRegressions(
  previousHistory: readonly HistoryEntry[],
  currentEntries: readonly HistoryEntry[],
): RegressionFinding[] {
  const findings: RegressionFinding[] = [];

  for (const current of currentEntries) {
    const priorForCase = previousHistory.filter((entry) => entry.caseId === current.caseId);
    if (priorForCase.length === 0) continue;
    const mostRecent = priorForCase.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));

    if (current.tokensSpent > mostRecent.tokensSpent) {
      findings.push({
        caseId: current.caseId,
        reason: `tokensSpent regressed: ${String(mostRecent.tokensSpent)} -> ${String(current.tokensSpent)}`,
      });
    }
    if (current.schemaViolations > mostRecent.schemaViolations) {
      findings.push({
        caseId: current.caseId,
        reason: `schemaViolations regressed: ${String(mostRecent.schemaViolations)} -> ${String(current.schemaViolations)}`,
      });
    }
    if (mostRecent.pass && !current.pass) {
      findings.push({
        caseId: current.caseId,
        reason: `was passing as of ${mostRecent.timestamp}, now fails`,
      });
    }
    if (
      current.durationMs > mostRecent.durationMs * DURATION_REGRESSION_MULTIPLIER &&
      current.durationMs > DURATION_REGRESSION_FLOOR_MS
    ) {
      findings.push({
        caseId: current.caseId,
        reason: `durationMs regressed sharply: ${mostRecent.durationMs.toFixed(1)}ms -> ${current.durationMs.toFixed(1)}ms`,
      });
    }
  }

  return findings;
}
