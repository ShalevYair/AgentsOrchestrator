/* eslint-disable no-console -- this file's whole job is CLI progress/error output, same precedent as packages/providers/src/demo.ts. */
import { CHEAP_FALLBACK_MODEL_ID } from "@ao/providers";
import { listEvalCaseIds, loadEvalCase } from "@ao/platform";
import type { EvalCase } from "@ao/shared";
import { resolveAgentsDir } from "./agents-dir.js";
import { parseTagFilters } from "./cli-args.js";
import { checkCostRegressions, loadCostBaseline, resolveCostBaselinePath } from "./cost-baseline.js";
import { resolveEvalsDir } from "./evals-dir.js";
import {
  appendHistory,
  detectRegressions,
  loadHistory,
  resolveHistoryPath,
  toHistoryEntry,
} from "./history.js";
import { judgeDeliverable, rubricFromAcceptanceCriteria } from "./judge.js";
import { createMockJudgeProvider } from "./mock-judge-provider.js";
import { resolveRecipesDir } from "./recipes-dir.js";
import { printReportTable, type JudgedEvalCaseRunResult } from "./report-table.js";
import { runEvalCase, type EvalCaseRunResult } from "./run-case.js";

/**
 * P11-T4 — always runs against whatever `deliverableText` the case
 * actually produced, even one that failed its own assertions (a task can
 * blow a cost ceiling and still have written a perfectly real deliverable
 * — the judge scores what was made, not whether the run "passed"). A case
 * that threw before producing anything (empty `deliverableText`) skips
 * the judge call entirely rather than scoring nothing.
 */
async function attachJudgeScore(
  result: EvalCaseRunResult,
  evalCase: EvalCase,
): Promise<JudgedEvalCaseRunResult> {
  if (result.deliverableText.length === 0) {
    return { ...result, judgeScore: 0, judgeTokensSpent: 0 };
  }
  const rubric = rubricFromAcceptanceCriteria(evalCase.understanding.acceptanceCriteria);
  const judged = await judgeDeliverable({
    provider: createMockJudgeProvider(rubric),
    model: CHEAP_FALLBACK_MODEL_ID,
    rubric,
    deliverableText: result.deliverableText,
  });
  return { ...result, judgeScore: judged.overallScore, judgeTokensSpent: judged.judgeTokensSpent };
}

async function main(): Promise<void> {
  const evalsDir = resolveEvalsDir({ moduleUrl: import.meta.url });
  const agentsDir = resolveAgentsDir({ moduleUrl: import.meta.url });
  const recipesDir = resolveRecipesDir({ moduleUrl: import.meta.url });

  const tagFilters = parseTagFilters(process.argv.slice(2));
  const allIds = listEvalCaseIds(evalsDir);
  const cases = allIds
    .map((id) => loadEvalCase(evalsDir, id))
    .filter((c) => tagFilters.every((tag) => c.tags.includes(tag)));

  if (allIds.length === 0) {
    console.log(`no eval cases found under ${evalsDir}/cases — nothing to run.`);
    process.exitCode = 1;
    return;
  }
  if (cases.length === 0) {
    console.log(`0 of ${String(allIds.length)} case(s) match tag filter [${tagFilters.join(", ")}].`);
    process.exitCode = 1;
    return;
  }

  console.log(`running ${String(cases.length)} of ${String(allIds.length)} eval case(s)...\n`);

  const results: JudgedEvalCaseRunResult[] = [];
  for (const evalCase of cases) {
    try {
      const result = await runEvalCase(evalCase, { agentsDir, recipesDir });
      results.push(await attachJudgeScore(result, evalCase));
    } catch (error) {
      results.push({
        id: evalCase.id,
        description: evalCase.description,
        tags: [...evalCase.tags],
        pass: false,
        failures: [`threw instead of completing: ${String(error instanceof Error ? error.stack : error)}`],
        durationMs: 0,
        tokensSpent: 0,
        costUsd: 0,
        schemaViolations: 0,
        continuationAttempts: 0,
        cacheHitTokens: 0,
        criteriaMet: 0,
        criteriaUnmet: 0,
        deliverableText: "",
        planSource: "planner",
        cancelled: false,
        judgeScore: 0,
        judgeTokensSpent: 0,
      });
    }
  }

  // TASKS.md P11-T3: compare against every case's own prior history
  // *before* this run's entries are appended to it, then persist this
  // run so the next invocation (a future commit, a future CI run) has
  // this one to compare against in turn.
  const historyPath = resolveHistoryPath(evalsDir);
  const previousHistory = loadHistory(historyPath);
  const timestamp = new Date().toISOString();
  const currentEntries = results.map((result) => toHistoryEntry(result, timestamp));
  const regressions = detectRegressions(previousHistory, currentEntries);
  appendHistory(historyPath, currentEntries);

  // TASKS.md P11-T5 — a committed, deliberately-updated baseline (not
  // history.jsonl's ever-growing per-run log) checked with real
  // tolerance, so CI can run just the "ci-cheap"-tagged subset and only
  // fail on a real cost blowup, not routine 1-token drift.
  const costBaseline = loadCostBaseline(resolveCostBaselinePath(evalsDir));
  const costRegressions = checkCostRegressions(costBaseline, results);

  printReportTable(results, regressions, costRegressions);
  process.exitCode =
    results.every((r) => r.pass) && regressions.length === 0 && costRegressions.length === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error("eval run crashed:", error);
  process.exitCode = 1;
});
