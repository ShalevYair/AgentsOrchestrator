import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LocalTool, ToolResult } from "@ao/shared";
import { discoverPython, type PythonInterpreter } from "@ao/platform";
import type { Sandbox } from "../sandbox/types.js";
import {
  PYTHON_PACKAGE_ALLOWLIST,
  detectRequestedPackages,
  ensureVenv,
  type EnsureVenvOptions,
} from "./python-venv.js";
import type { ToolRunLog } from "../transparency/tool-run-log.js";
import { buildToolResult } from "./tool-result.js";

export interface RunPythonToolOptions {
  tool: LocalTool;
  sandbox: Sandbox;
  /** Jail root the script actually executes inside — a fresh subdirectory is created per run. */
  stagingRoot: string;
  /** Where per-package-set venvs are cached; outside the jail (pip needs real network). */
  venvRoot: string;
  /** Injectable for tests; defaults to the real `@ao/platform` discovery. */
  interpreter?: PythonInterpreter | null;
  allowlist?: string[];
  ensureVenvFn?: typeof ensureVenv;
  /** P7-T6 — when provided, every run is recorded (script, output size, exit code, timing), regardless of success/failure. */
  runLog?: ToolRunLog;
}

export class PythonInterpreterNotFoundError extends Error {
  constructor() {
    super("no Python 3 interpreter found (tried py -3 / python3 / python via @ao/platform's discovery)");
    this.name = "PythonInterpreterNotFoundError";
  }
}

/**
 * PROTOCOLS.md §11 / P7-T2. Interpreter discovery goes through
 * `@ao/platform`'s `discoverPython` (P0-T10) — not reimplemented here.
 * `PYTHONIOENCODING`/`PYTHONUTF8` are **always** set, unconditionally, on
 * every platform: Windows' console default codepage (cp1252) mangles
 * Hebrew, and there's no cheap way to detect "would this platform have
 * mangled it" from inside Node, so the fix is applied everywhere rather
 * than conditionally on `process.platform`.
 *
 * ⚠️ Caller note, found empirically while testing this: `tool.limits.memoryMb`
 * is a hard `ulimit -v` (virtual address space) cap on Linux/macOS, and
 * `pandas`'s own import machinery needs a few hundred MB of address space
 * just to load its submodules — a 256MB cap reliably `MemoryError`s mid
 * `import pandas`, while 384MB+ doesn't. A `LocalTool` whose script imports
 * `pandas` should request at least ~512MB, independent of how much memory
 * the script's own logic actually needs.
 */
export async function runPythonTool(options: RunPythonToolOptions): Promise<ToolResult> {
  if (options.tool.runtime !== "python") {
    throw new Error(`runPythonTool given a non-python LocalTool (runtime: ${options.tool.runtime})`);
  }

  const interpreter = options.interpreter === undefined ? discoverPython() : options.interpreter;
  if (!interpreter) throw new PythonInterpreterNotFoundError();

  const allowlist = options.allowlist ?? PYTHON_PACKAGE_ALLOWLIST;
  const packages = detectRequestedPackages(options.tool.script, allowlist);
  const ensureVenvImpl = options.ensureVenvFn ?? ensureVenv;
  const venvOptions: EnsureVenvOptions = { venvRoot: options.venvRoot, interpreter, packages };
  const pythonBin = ensureVenvImpl(venvOptions);

  mkdirSync(options.stagingRoot, { recursive: true });
  const workDir = mkdtempSync(join(options.stagingRoot, "run-"));
  writeFileSync(join(workDir, "script.py"), options.tool.script, "utf8");
  writeFileSync(join(workDir, "inputs.json"), JSON.stringify(options.tool.inputs), "utf8");

  const startedAtMs = Date.now();
  const runResult = await options.sandbox.run({
    command: pythonBin,
    args: ["script.py", "inputs.json"],
    cwd: workDir,
    stagingRoot: options.stagingRoot,
    timeoutMs: options.tool.limits.timeoutMs,
    maxOutputBytes: options.tool.limits.maxOutputBytes,
    memoryMb: options.tool.limits.memoryMb,
    network: options.tool.limits.network,
    env: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  });
  options.runLog?.record(options.tool, runResult, startedAtMs);

  return buildToolResult(options.tool, runResult);
}
