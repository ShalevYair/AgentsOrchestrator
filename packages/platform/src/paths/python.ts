import { spawnSync } from "node:child_process";
import { platform } from "node:os";

export interface PythonCandidate {
  command: string;
  args: string[];
}

export interface PythonInterpreter {
  command: string;
  args: string[];
  version: string;
}

/**
 * Probe order per platform. On Windows the `py` launcher (with -3) is the
 * recommended way to find an interpreter regardless of how PATH is set up;
 * `python3`/`python` are the Unix convention. Every candidate is tried as a
 * literal argv array with shell:false — never string-concatenated into a
 * shell command — so there is no injection surface here.
 */
export function candidatesForPlatform(): PythonCandidate[] {
  if (platform() === "win32") {
    return [
      { command: "py", args: ["-3"] },
      { command: "python3", args: [] },
      { command: "python", args: [] },
    ];
  }
  return [
    { command: "python3", args: [] },
    { command: "python", args: [] },
  ];
}

const VERSION_PATTERN = /Python (\d+\.\d+\.\d+)/;

export function discoverPython(
  candidates: PythonCandidate[] = candidatesForPlatform(),
): PythonInterpreter | null {
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, "--version"], {
      shell: false,
      timeout: 5000,
      encoding: "utf8",
    });
    if (result.error || result.status !== 0) {
      continue;
    }
    const output = `${result.stdout}${result.stderr}`;
    const match = VERSION_PATTERN.exec(output);
    if (!match?.[1]) {
      continue;
    }
    return { command: candidate.command, args: candidate.args, version: match[1] };
  }
  return null;
}

export const MINIMUM_PYTHON_VERSION = "3.11.0";

function parseVersionParts(version: string): [number, number, number] {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function meetsMinimumPythonVersion(
  version: string,
  minimum: string = MINIMUM_PYTHON_VERSION,
): boolean {
  const [major, minor, patch] = parseVersionParts(version);
  const [minMajor, minMinor, minPatch] = parseVersionParts(minimum);
  if (major !== minMajor) return major > minMajor;
  if (minor !== minMinor) return minor > minMinor;
  return patch >= minPatch;
}
