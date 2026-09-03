/**
 * P8-T4 — the code half of "אימות מקומי": the *generated project's own*
 * `tsc`/lint/tests are the validation oracle (ARCHITECTURE.md §6 point 4),
 * not AgentsOrchestrator's own toolchain — this validates a multi-file
 * deliverable a `coder` stage just assembled (P8-T3), which has its own
 * package.json/tsconfig/tests, entirely separate from this repo's.
 *
 * **Explicit scope decision, documented per the session brief:** this
 * module does *not* go through `@ao/tools`'s `Sandbox` (P7). That sandbox
 * is built around running an LLM-authored script whose behavior is
 * unknown and must be contained (network/memory/path jailing, package
 * allowlists). Here the commands themselves are fixed and known
 * (`tsc --noEmit`, a lint binary, a test runner) — what's untrusted is
 * only the *source files* they read, and `tsc`/eslint/vitest are already
 * designed to read arbitrary source without executing it as code (tsc
 * type-checks, it doesn't run the program). Routing a fixed, well-known
 * command through the script-sandboxing machinery built for arbitrary
 * Python/Node would be a mismatch, not an extra layer of safety — so
 * command execution is injected by the caller (`RunCommand`, same
 * dependency-injection boundary as `LLMProvider`/`RunLocalTool` elsewhere
 * in this package) rather than this module owning process-spawning at
 * all. `packages/core` therefore stays exactly as I/O-free as every other
 * module in it; a real caller supplies a real spawn-based `RunCommand`
 * (e.g. from `apps/runtime`, with its own timeout).
 */
export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type RunCommand = (command: string, args: readonly string[], cwd: string) => Promise<CommandResult>;

export interface CodeCheckSpec {
  kind: "typecheck" | "lint" | "test";
  command: string;
  args: readonly string[];
}

export interface CodeViolation {
  kind: "typecheck" | "lint" | "test";
  /** Best-effort, parsed from the tool's own output (`path(line,col): ...` or `path:line:col ...`) — empty when the output didn't match either shape, which is reported rather than guessed at. */
  filePaths: string[];
  detail: string;
}

export interface CodeValidationResult {
  passed: boolean;
  violations: CodeViolation[];
}

export interface RunCodeValidationParams {
  runCommand: RunCommand;
  cwd: string;
  checks: readonly CodeCheckSpec[];
}

/** Matches both `tsc`'s `path(line,col): error ...` and eslint/most other linters' `path:line:col  error ...` — the two shapes this project's own toolchain (tsc, eslint) actually produces. */
const FILE_LOCATION_LINE = /^(\S+?)(?:\((\d+),(\d+)\)|:(\d+):(\d+))/;

function parseFilePaths(output: string): string[] {
  const paths = new Set<string>();
  for (const line of output.split("\n")) {
    const match = FILE_LOCATION_LINE.exec(line.trim());
    if (match) paths.add(match[1]!);
  }
  return [...paths];
}

/**
 * Runs each configured check via the injected `runCommand` and aggregates
 * failures. A check "fails" purely on its own real exit code — never on
 * output content — so this stays honest about what it can and can't
 * parse: `filePaths` is best-effort locality for P8-T5's seam scope, but
 * `passed`/failure detection never depends on it.
 */
export async function runCodeValidation(params: RunCodeValidationParams): Promise<CodeValidationResult> {
  const violations: CodeViolation[] = [];
  for (const check of params.checks) {
    const result = await params.runCommand(check.command, check.args, params.cwd);
    if (result.exitCode === 0) continue;
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    violations.push({
      kind: check.kind,
      filePaths: parseFilePaths(combinedOutput),
      detail: combinedOutput.trim().slice(0, 4000), // cap — this is diagnostic text for a human/seam-stitch prompt, not an unbounded log
    });
  }
  return { passed: violations.length === 0, violations };
}
