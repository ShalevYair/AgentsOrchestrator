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

/**
 * `ulimit -v`/`ulimit -t` are `/bin/sh` builtins (POSIX-mandated, no
 * external binary) — applying them costs nothing extra and needs no
 * dependency. `ulimit -t` is a CPU-seconds backstop set generously above
 * the wall-clock timeout (which is the primary, always-on kill mechanism
 * via `runPosixProcess`'s `SIGKILL` to the process group) — belt-and-braces
 * in case the Node timer somehow doesn't fire under extreme host load.
 */
function buildShellWrapped(options: SandboxRunOptions): { command: string; args: string[] } {
  const memoryKb = options.memoryMb * 1024;
  const cpuSeconds = Math.max(1, Math.ceil(options.timeoutMs / 1000) + 5);
  const prelude = `ulimit -v ${String(memoryKb)}; ulimit -t ${String(cpuSeconds)}; exec "$0" "$@"`;
  return { command: "/bin/sh", args: ["-c", prelude, options.command, ...options.args] };
}

export class LinuxSandbox implements Sandbox {
  readonly capabilities: SandboxCapabilities;

  constructor(capabilities: SandboxCapabilities = probeCapabilities("linux")) {
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
          command: "unshare",
          args: ["--user", "--net", "--map-root-user", "--", shellWrapped.command, ...shellWrapped.args],
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
