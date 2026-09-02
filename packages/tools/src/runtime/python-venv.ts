import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { PythonInterpreter } from "@ao/platform";

/**
 * The security boundary for "package allowlist" isn't a static scan of the
 * script's `import` lines — that's trivially bypassable (`importlib.
 * import_module`, `__import__`, a string built at runtime). The boundary is
 * that **the venv itself only ever contains packages from this allowlist**:
 * anything else a script tries to import simply isn't installed, so it
 * fails with a real `ModuleNotFoundError` at runtime no matter how it tries
 * to reach it. `detectRequestedPackages` below is only a convenience for
 * deciding what to install — never the enforcement mechanism itself.
 */
export const PYTHON_PACKAGE_ALLOWLIST = ["pandas", "numpy"];

const IMPORT_PATTERN = /^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;

export function detectRequestedPackages(
  script: string,
  allowlist: string[] = PYTHON_PACKAGE_ALLOWLIST,
): string[] {
  const found = new Set<string>();
  for (const match of script.matchAll(IMPORT_PATTERN)) {
    const name = match[1];
    if (name !== undefined && allowlist.includes(name)) found.add(name);
  }
  return [...found].sort();
}

export function computeVenvKey(pythonVersion: string, packages: string[]): string {
  const hash = createHash("sha256");
  hash.update(pythonVersion);
  hash.update("|");
  hash.update([...packages].sort().join(","));
  return hash.digest("hex").slice(0, 16);
}

export interface EnsureVenvOptions {
  venvRoot: string;
  interpreter: PythonInterpreter;
  packages: string[];
  /** Injectable for tests — never touches a real venv/pip. */
  spawnFn?: typeof spawnSync;
}

const BIN_DIR = process.platform === "win32" ? "Scripts" : "bin";
const PYTHON_EXE = process.platform === "win32" ? "python.exe" : "python3";
const PIP_EXE = process.platform === "win32" ? "pip.exe" : "pip3";

/**
 * One isolated venv per distinct `(python version, package set)` — reused
 * across runs sharing the same set (keyed by `computeVenvKey`), never
 * shared with a run requesting a different set. Creation (`python -m
 * venv`) and `pip install` happen **outside** the `Sandbox` — they need
 * real network access to PyPI, which is exactly what the sandboxed
 * *execution* of the script must not have.
 */
export function ensureVenv(options: EnsureVenvOptions): string {
  const spawnFn = options.spawnFn ?? spawnSync;
  const key = computeVenvKey(options.interpreter.version, options.packages);
  const venvDir = join(options.venvRoot, key);
  const pythonBin = join(venvDir, BIN_DIR, PYTHON_EXE);

  if (existsSync(pythonBin)) return pythonBin;

  mkdirSync(options.venvRoot, { recursive: true });
  const createResult = spawnFn(
    options.interpreter.command,
    [...options.interpreter.args, "-m", "venv", venvDir],
    { timeout: 60_000, encoding: "utf8" },
  );
  if (createResult.error || createResult.status !== 0) {
    throw new Error(
      `failed to create venv at ${venvDir}: ${createResult.stderr ?? createResult.error?.message ?? "unknown error"}`,
    );
  }

  if (options.packages.length > 0) {
    const pipBin = join(venvDir, BIN_DIR, PIP_EXE);
    const installResult = spawnFn(
      pipBin,
      ["install", "--no-input", "--disable-pip-version-check", ...options.packages],
      { timeout: 300_000, encoding: "utf8" },
    );
    if (installResult.error || installResult.status !== 0) {
      throw new Error(
        `failed to install [${options.packages.join(", ")}] into ${venvDir}: ` +
          `${installResult.stderr ?? installResult.error?.message ?? "unknown error"}`,
      );
    }
  }

  return pythonBin;
}
