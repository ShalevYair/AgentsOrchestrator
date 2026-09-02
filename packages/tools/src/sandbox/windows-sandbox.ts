import { spawn, spawnSync } from "node:child_process";
import { resolveWithinRoot } from "@ao/platform";
import { probeCapabilities } from "./capabilities.js";
import {
  SandboxJailViolationError,
  type Sandbox,
  type SandboxCapabilities,
  type SandboxRunOptions,
  type SandboxRunResult,
} from "./types.js";

export interface WindowsSandboxDeps {
  spawnFn: typeof spawn;
  taskkillFn: typeof spawnSync;
  /** Polls a pid's working-set size in bytes; `null` if the process is already gone or the query failed. */
  pollMemoryBytes: (pid: number) => number | null;
  pollIntervalMs: number;
}

const WORKING_SET_PATTERN = /WorkingSetSize=(\d+)/;

/**
 * `wmic` ships with every Windows install (no dependency to add) and can
 * read another process's working-set size without any native code —
 * ADR-012's constraint. This is polled rather than kernel-enforced (there's
 * no rlimit equivalent Node can reach without a native Job Objects binding),
 * which is exactly why `capabilities.memoryCpuCaps` is reported as
 * `"partial"`, not `"full"`, for Windows: a fast allocation spike between
 * two polls can transiently exceed the cap before it's caught.
 */
function defaultPollMemoryBytes(pid: number, run: typeof spawnSync = spawnSync): number | null {
  const result = run(
    "wmic",
    ["process", "where", `ProcessId=${String(pid)}`, "get", "WorkingSetSize", "/value"],
    {
      encoding: "utf8",
      timeout: 5000,
    },
  );
  if (result.error || result.status !== 0) return null;
  const match = WORKING_SET_PATTERN.exec(result.stdout);
  if (!match?.[1]) return null;
  return Number.parseInt(match[1], 10);
}

const DEFAULT_DEPS: WindowsSandboxDeps = {
  spawnFn: spawn,
  taskkillFn: spawnSync,
  pollMemoryBytes: defaultPollMemoryBytes,
  pollIntervalMs: 200,
};

/**
 * **Implemented to the `Sandbox` contract but not empirically run on real
 * Windows** in this session (no Windows machine available here) — unit
 * tests inject fake `spawnFn`/`taskkillFn`/`pollMemoryBytes` to verify the
 * *logic* (taskkill invoked with the right args on timeout, kill triggered
 * when the polled memory exceeds the cap, output truncation) without a real
 * OS process tree. CI's `windows-latest` matrix leg is what will actually
 * exercise this against real `taskkill`/`wmic` binaries — P0-T5's existing
 * three-platform CI matrix, not a new mechanism.
 *
 * Network is never blocked here (`capabilities.networkBlocking` is always
 * `false`) — ADR-013: Windows without Job Objects/a container has no
 * reliable way to cut a child process off from the network, so this must
 * not pretend to.
 */
export class WindowsSandbox implements Sandbox {
  readonly capabilities: SandboxCapabilities;
  private readonly deps: WindowsSandboxDeps;

  constructor(
    capabilities: SandboxCapabilities = probeCapabilities("win32"),
    deps: Partial<WindowsSandboxDeps> = {},
  ) {
    this.capabilities = capabilities;
    this.deps = { ...DEFAULT_DEPS, ...deps };
  }

  async run(options: SandboxRunOptions): Promise<SandboxRunResult> {
    const jail = resolveWithinRoot(options.stagingRoot, options.cwd);
    if (!jail.ok) {
      throw new SandboxJailViolationError(
        `sandbox cwd escapes the staging root: ${jail.reason ?? "unknown reason"} (${jail.resolvedPath})`,
      );
    }

    const start = Date.now();
    const memoryLimitBytes = options.memoryMb * 1024 * 1024;

    return new Promise((resolvePromise) => {
      const child = this.deps.spawnFn(options.command, options.args, {
        cwd: jail.resolvedPath,
        env: options.env ?? {},
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdoutBytes = 0;
      let stderrBytes = 0;
      let truncated = false;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let timedOut = false;
      let memoryExceeded = false;
      let settled = false;

      const killTree = (pid: number | undefined): void => {
        if (pid === undefined) return;
        this.deps.taskkillFn("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: 5000 });
      };

      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid);
      }, options.timeoutMs);

      const pollTimer = setInterval(() => {
        const pid = child.pid;
        if (pid === undefined) return;
        const bytes = this.deps.pollMemoryBytes(pid);
        if (bytes !== null && bytes > memoryLimitBytes) {
          memoryExceeded = true;
          killTree(pid);
        }
      }, this.deps.pollIntervalMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdoutBytes >= options.maxOutputBytes) {
          truncated = true;
          return;
        }
        const remaining = options.maxOutputBytes - stdoutBytes;
        const piece = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
        if (piece.byteLength < chunk.byteLength) truncated = true;
        stdoutChunks.push(piece);
        stdoutBytes += piece.byteLength;
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderrBytes >= options.maxOutputBytes) {
          truncated = true;
          return;
        }
        const remaining = options.maxOutputBytes - stderrBytes;
        const piece = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
        if (piece.byteLength < chunk.byteLength) truncated = true;
        stderrChunks.push(piece);
        stderrBytes += piece.byteLength;
      });

      const settle = (result: SandboxRunResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        clearInterval(pollTimer);
        resolvePromise(result);
      };

      child.on("error", (error) => {
        settle({
          ok: false,
          exitCode: null,
          signal: null,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: `${Buffer.concat(stderrChunks).toString("utf8")}\n${error.message}`,
          truncated,
          timedOut,
          durationMs: Date.now() - start,
          networkBlocked: false,
        });
      });

      child.on("close", (code, signal) => {
        const stderrText = Buffer.concat(stderrChunks).toString("utf8");
        settle({
          ok: !timedOut && !memoryExceeded && code === 0,
          exitCode: code,
          signal,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: memoryExceeded
            ? `${stderrText}\n[sandbox] memory limit exceeded — process tree killed`
            : stderrText,
          truncated,
          timedOut,
          durationMs: Date.now() - start,
          networkBlocked: false,
        });
      });
    });
  }
}
