/* eslint-disable no-console -- this file's whole job is CLI progress/error output, same precedent as packages/providers/src/demo.ts. */
import { listEvalCaseIds, loadEvalCase } from "@ao/platform";
import { resolveAgentsDir } from "./agents-dir.js";
import { parseTagFilters } from "./cli-args.js";
import { resolveEvalsDir } from "./evals-dir.js";
import { resolveRecipesDir } from "./recipes-dir.js";
import { printReportTable } from "./report-table.js";
import { runEvalCase, type EvalCaseRunResult } from "./run-case.js";

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

  const results: EvalCaseRunResult[] = [];
  for (const evalCase of cases) {
    try {
      results.push(await runEvalCase(evalCase, { agentsDir, recipesDir }));
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
        planSource: "planner",
        cancelled: false,
      });
    }
  }

  printReportTable(results);
  process.exitCode = results.every((r) => r.pass) ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error("eval run crashed:", error);
  process.exitCode = 1;
});
