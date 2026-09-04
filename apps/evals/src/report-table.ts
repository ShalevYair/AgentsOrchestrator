/* eslint-disable no-console -- this file's whole job is CLI table/summary output, same precedent as packages/providers/src/demo.ts. */
import type { EvalCaseRunResult } from "./run-case.js";

interface TableRow {
  case: string;
  tags: string;
  result: string;
  tokens: number;
  costUsd: string;
  ms: number;
  schemaViolations: number;
  source: string;
}

function toRow(result: EvalCaseRunResult): TableRow {
  return {
    case: result.id,
    tags: result.tags.join(","),
    result: result.pass ? "PASS" : "FAIL",
    tokens: result.tokensSpent,
    costUsd: result.costUsd.toFixed(4),
    ms: Math.round(result.durationMs),
    schemaViolations: result.schemaViolations,
    source: result.planSource,
  };
}

/**
 * TASKS.md P11-T1's done-criterion, literally: "`pnpm eval` מריץ הכל
 * ומדפיס טבלה" (runs everything and prints a table). `console.table` is
 * the plain, dependency-free way to do that for a CLI script.
 */
export function printReportTable(results: readonly EvalCaseRunResult[]): void {
  const rows = results.map(toRow);
  console.table(rows);

  const failing = results.filter((r) => !r.pass);
  if (failing.length > 0) {
    console.log(`\n${String(failing.length)} of ${String(results.length)} case(s) failed:\n`);
    for (const result of failing) {
      console.log(`  ${result.id}:`);
      for (const failure of result.failures) {
        console.log(`    - ${failure}`);
      }
    }
  } else {
    console.log(`\nall ${String(results.length)} case(s) passed.`);
  }

  const totalTokens = results.reduce((sum, r) => sum + r.tokensSpent, 0);
  const totalCostUsd = results.reduce((sum, r) => sum + r.costUsd, 0);
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  console.log(
    `\ntotals — tokens: ${String(totalTokens)}, cost: $${totalCostUsd.toFixed(4)}, time: ${totalMs.toFixed(0)}ms`,
  );
}
