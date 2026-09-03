import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LocalTool, ToolResult } from "@ao/shared";
import type { Sandbox } from "../sandbox/types.js";
import type { ToolRunLog } from "../transparency/tool-run-log.js";
import { buildToolResult } from "./tool-result.js";

export interface RunNodeToolOptions {
  tool: LocalTool;
  sandbox: Sandbox;
  /** Jail root the script actually executes inside — a fresh subdirectory is created per run. */
  stagingRoot: string;
  /** Injectable for tests; defaults to the Node binary currently running this process. */
  nodeBin?: string;
  /** P7-T6 — when provided, every run is recorded (script, output size, exit code, timing), regardless of success/failure. */
  runLog?: ToolRunLog;
}

/**
 * PROTOCOLS.md §11 / P7-T3 — "same boundaries as T2": interpreter discovery,
 * jail, timeout, output truncation. Two differences from `python-runner.ts`,
 * both deliberate:
 *
 * 1. **No venv/npm-install step.** Nothing in ARCHITECTURE.md/TASKS.md calls
 *    for a Node package allowlist the way Python's `pandas`/`numpy` are
 *    named explicitly — a toolsmith-written Node script is expected to stay
 *    within Node's own built-ins (`fs`, `path`, `crypto`, ...), which are
 *    already fully available with no install step. If a future task adds
 *    npm packages to the allowlist, this is the file that grows an
 *    `ensureNodeModules`-equivalent of `python-venv.ts`.
 * 2. **No forced UTF-8 encoding env var**, unlike Python's
 *    `PYTHONIOENCODING`/`PYTHONUTF8`. Node writes stdout as UTF-8
 *    unconditionally whenever it isn't a real console (i.e. whenever it's
 *    redirected to a pipe, which is exactly `Sandbox.run`'s `stdio: ["ignore",
 *    "pipe", "pipe"]`) — the cp1252 mangling risk is specific to Python's
 *    locale-based text-mode stdout, not Node's. `hebrew round-trips`'s test
 *    below proves this rather than asserting it from memory.
 *
 * Interpreter "discovery" is just `process.execPath` — unlike Python, the
 * Node runtime executing this very code *is* the interpreter, so there's no
 * separate binary to hunt for on PATH.
 *
 * **Memory capping works completely differently from Python's, and this
 * was found empirically, not assumed:** the `Sandbox`'s `ulimit -v`
 * (`RLIMIT_AS`, a hard cap on the process's *virtual address space*) is
 * what Python uses, and it's the right tool there. For Node it isn't —
 * V8 reserves a large chunk of virtual address space (its "CodeRange") the
 * moment it starts, *before running any script code*: measured directly in
 * this environment, plain `node -e "console.log(1)"` under `ulimit -v` dies
 * with a V8 "Fatal process out of memory: Failed to reserve virtual memory
 * for CodeRange" at 512MB and only succeeds from ~1024MB up — regardless of
 * how small the script's actual footprint is. So handing the tool's
 * requested `memoryMb` (a realistic per-script cap like 128-256MB) straight
 * to `Sandbox.run`'s `ulimit -v` would make Node fail to start at all, every
 * time.
 *
 * The fix: `Sandbox.run` still gets a `ulimit -v`, but raised to a fixed
 * floor generous enough for V8 to start (`ULIMIT_FLOOR_MB`) — a backstop
 * against a truly extreme native/off-heap allocation, not the real cap. The
 * actual requested `memoryMb` is enforced via V8's own
 * `--max-old-space-size` flag instead, which caps *JS heap* growth and
 * produces a clean "JavaScript heap out of memory" fatal error (verified
 * directly: a script deliberately growing an array past the limit crashes
 * with exactly that message, not a hang). This is narrower than Python's
 * cap — off-heap/native buffer memory outside V8's managed heap isn't
 * covered — and that gap is deliberately not hidden here.
 */
const NODE_STARTUP_ULIMIT_FLOOR_MB = 1536;

export async function runNodeTool(options: RunNodeToolOptions): Promise<ToolResult> {
  if (options.tool.runtime !== "node") {
    throw new Error(`runNodeTool given a non-node LocalTool (runtime: ${options.tool.runtime})`);
  }

  const nodeBin = options.nodeBin ?? process.execPath;

  mkdirSync(options.stagingRoot, { recursive: true });
  const workDir = mkdtempSync(join(options.stagingRoot, "run-"));
  writeFileSync(join(workDir, "script.js"), options.tool.script, "utf8");
  writeFileSync(join(workDir, "inputs.json"), JSON.stringify(options.tool.inputs), "utf8");

  const startedAtMs = Date.now();
  const runResult = await options.sandbox.run({
    command: nodeBin,
    args: [`--max-old-space-size=${String(options.tool.limits.memoryMb)}`, "script.js", "inputs.json"],
    cwd: workDir,
    stagingRoot: options.stagingRoot,
    timeoutMs: options.tool.limits.timeoutMs,
    maxOutputBytes: options.tool.limits.maxOutputBytes,
    memoryMb: options.tool.limits.memoryMb + NODE_STARTUP_ULIMIT_FLOOR_MB,
    network: options.tool.limits.network,
    env: {},
  });
  options.runLog?.record(options.tool, runResult, startedAtMs);

  return buildToolResult(options.tool, runResult);
}
