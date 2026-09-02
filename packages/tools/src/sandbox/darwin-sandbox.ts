import { resolveWithinRoot } from "@ao/platform";
import { probeCapabilities } from "./capabilities.js";
import { runPosixProcess } from "./posix-exec.js";
import {
  SandboxJailViolationError,
  type Sandbox,
  type SandboxCapabilities,
  type SandboxRunOptions,
  type SandboxRunResult,
} from "./types.js";

const SANDBOX_EXEC_PROFILE = "(version 1)(allow default)(deny network*)";

/**
 * Only `ulimit -t` (CPU seconds) is applied here, not `-v` — macOS does not
 * reliably enforce `RLIMIT_AS` (verified via web search, see
 * `capabilities.ts`'s doc comment), so setting it would be exactly the kind
 * of false confidence ADR-013 forbids. The wall-clock timeout (via
 * `runPosixProcess`'s `SIGKILL` to the process group) is what actually
 * bounds a memory-hungry runaway script here: it can't run past the
 * timeout, even though its peak memory during that window isn't capped.
 */
function buildShellWrapped(options: SandboxRunOptions): { command: string; args: string[] } {
  const cpuSeconds = Math.max(1, Math.ceil(options.timeoutMs / 1000) + 5);
  const prelude = `ulimit -t ${String(cpuSeconds)}; exec "$0" "$@"`;
  return { command: "/bin/sh", args: ["-c", prelude, options.command, ...options.args] };
}

/**
 * **Implemented to the `Sandbox` contract but not empirically run**: this
 * session has no macOS machine available (see `capabilities.ts`'s doc
 * comment on `probeDarwinSandboxExec`). Structurally identical to
 * `linux-sandbox.ts` — only the network-blocking wrapper (Seatbelt profile
 * instead of a network namespace) and the memory-cap honesty differ.
 */
export class DarwinSandbox implements Sandbox {
  readonly capabilities: SandboxCapabilities;

  constructor(capabilities: SandboxCapabilities = probeCapabilities("darwin")) {
    this.capabilities = capabilities;
  }

  async run(options: SandboxRunOptions): Promise<SandboxRunResult> {
    const jail = resolveWithinRoot(options.stagingRoot, options.cwd);
    if (!jail.ok) {
      throw new SandboxJailViolationError(
        `sandbox cwd escapes the staging root: ${jail.reason ?? "unknown reason"} (${jail.resolvedPath})`,
      );
    }

    const wantsNetworkBlocked = !options.network;
    const willBlockNetwork = wantsNetworkBlocked && this.capabilities.networkBlocking;
    const shellWrapped = buildShellWrapped(options);

    const { command, args } = willBlockNetwork
      ? {
          command: "sandbox-exec",
          args: ["-p", SANDBOX_EXEC_PROFILE, "--", shellWrapped.command, ...shellWrapped.args],
        }
      : shellWrapped;

    return runPosixProcess({
      command,
      args,
      cwd: jail.resolvedPath,
      timeoutMs: options.timeoutMs,
      maxOutputBytes: options.maxOutputBytes,
      env: options.env ?? {},
      networkBlocked: willBlockNetwork,
    });
  }
}
