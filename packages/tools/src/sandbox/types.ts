/**
 * ARCHITECTURE.md §8 / ADR-013 — `Sandbox` is an interface with (at least)
 * two concrete implementations here (Linux, macOS — see `linux-sandbox.ts` /
 * `darwin-sandbox.ts`) plus a Windows-native one (`windows-sandbox.ts`), not
 * Linux code with platform patches. A Docker-backed implementation (P7-T7)
 * is a later, separate task — it slots into this same interface without
 * changing it.
 *
 * `capabilities` must always describe what this concrete instance actually
 * verified it can do, never what the platform ideally could do — ADR-013's
 * "declare weak isolation rather than fake strong isolation".
 */

export type SandboxPlatform = "linux" | "darwin" | "win32";
export type SandboxImplementation = "linux" | "darwin" | "windows-native" | "docker";

/**
 * Memory/CPU capping strength:
 * - "full": kernel-enforced hard limit (POSIX rlimits via `ulimit`).
 * - "partial": best-effort only — either the OS doesn't reliably enforce it
 *   (macOS's `ulimit -v` does not reliably cap virtual memory — verified via
 *   web search, not just assumed, see `darwin-sandbox.ts`) or it is enforced
 *   by polling the child's usage and killing after the fact (Windows-native
 *   has no rlimit equivalent without Job Objects, which Node cannot use
 *   without a native addon — banned by ADR-012), which can miss a fast spike
 *   between polls.
 * - "none": not enforced at all.
 */
export type MemoryCpuCapStrength = "full" | "partial" | "none";

export interface SandboxCapabilities {
  platform: SandboxPlatform;
  implementation: SandboxImplementation;
  /** Wall-clock timeout with a kill of the *entire* process tree, not just the direct child. */
  timeoutAndProcessTreeKill: boolean;
  /** Working directory confined to a staging root, case-normalized (platform's `resolveWithinRoot`). */
  pathJail: boolean;
  /** Static allowlist of importable packages/modules enforced before running the script. */
  packageAllowlist: boolean;
  memoryCpuCaps: MemoryCpuCapStrength;
  /** Outbound network actually blocked for the running script (not merely requested). */
  networkBlocking: boolean;
  /** Human-readable caveats — e.g. what a UI banner should say when isolation is partial. */
  notes: string[];
}

export interface SandboxRunOptions {
  command: string;
  args: string[];
  /** Absolute path the process runs in; must resolve inside `stagingRoot`. */
  cwd: string;
  /** Absolute path of the jail root — nothing outside this may be treated as writable/cwd. */
  stagingRoot: string;
  timeoutMs: number;
  maxOutputBytes: number;
  memoryMb: number;
  /** Requested from `LocalTool.limits.network` — `false` means "please block". */
  network: boolean;
  env?: Record<string, string>;
}

export interface SandboxRunResult {
  ok: boolean;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  /** True if stdout+stderr were cut off at `maxOutputBytes` — PROTOCOLS.md §11: never silently dropped. */
  truncated: boolean;
  timedOut: boolean;
  durationMs: number;
  /**
   * What actually happened to outbound network for this run — independent
   * of what was requested. A caller that asked for `network: false` on a
   * platform where `capabilities.networkBlocking` is `false` gets
   * `networkBlocked: false` back and must surface that, never assume it.
   */
  networkBlocked: boolean;
}

export interface Sandbox {
  readonly capabilities: SandboxCapabilities;
  run(options: SandboxRunOptions): Promise<SandboxRunResult>;
}

export class SandboxJailViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxJailViolationError";
  }
}
