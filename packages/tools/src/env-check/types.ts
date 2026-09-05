import type { SandboxCapabilities } from "../sandbox/types.js";

export interface NodeCheck {
  version: string;
  majorVersion: number;
  minMajorVersion: number;
  ok: boolean;
}

export interface PythonCheck {
  available: boolean;
  version: string | null;
  command: string | null;
  minVersion: string;
  /** True only when a usable interpreter was found *and* meets `minVersion`. */
  ok: boolean;
  /** Per-platform install guidance; set only when `ok` is false. */
  installInstructions: string | null;
}

export interface DockerCheck {
  available: boolean;
}

/**
 * P12-T2. Read-only snapshot of what this machine can actually run — never
 * throws, never blocks startup: every field here degrades to a "missing"
 * value instead of an exception (mirrors `discoverPython`/`probeCapabilities`,
 * which already follow this rule individually — this just composes them).
 */
export interface EnvironmentReport {
  node: NodeCheck;
  python: PythonCheck;
  docker: DockerCheck;
  /**
   * The sandbox isolation actually in effect right now (native per-OS
   * implementation — P7-T1/ADR-013), independent of whether Docker is
   * *also* available. On Windows without Docker this is what surfaces the
   * real isolation level instead of an assumed one.
   */
  sandbox: SandboxCapabilities;
}
