import { spawn } from "node:child_process";
import type { SandboxRunResult } from "./types.js";

export interface PosixExecOptions {
  /** Already-wrapped argv[0] (e.g. `/bin/sh`, or `unshare` when network-blocking). */
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  /** Overrides layered on top of the current process's own environment — never a full replacement (a bare `{}` would strip `PATH`/`HOME`/etc. and break the interpreter itself). */
  env: Record<string, string>;
  networkBlocked: boolean;
}

/**
 * Spawns `detached: true` so the child becomes its own process-group leader
 * (POSIX `setsid` semantics) — `process.kill(-pid, signal)` (negative pid)
 * then signals the *whole group*, not just the direct child, which is what
 * lets a script that forks its own children (a shell wrapper included) be
 * killed atomically on timeout instead of leaving orphans behind. This is
 * the actual process-tree-kill mechanism for Linux/macOS; verified with a
 * dedicated pentest (see `linux-sandbox.pentest.test.ts`).
 */
export async function runPosixProcess(options: PosixExecOptions): Promise<SandboxRunResult> {
  const start = Date.now();

  return new Promise((resolvePromise) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, options.timeoutMs);

    function killGroup(pid: number | undefined): void {
      if (pid === undefined) return;
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // Group already gone (process exited between the check and the kill) — not an error.
      }
    }

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

    function finish(exitCode: number | null, signal: NodeJS.Signals | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        ok: !timedOut && exitCode === 0,
        exitCode,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        truncated,
        timedOut,
        durationMs: Date.now() - start,
        networkBlocked: options.networkBlocked,
      });
    }

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        ok: false,
        exitCode: null,
        signal: null,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: `${Buffer.concat(stderrChunks).toString("utf8")}\n${error.message}`,
        truncated,
        timedOut,
        durationMs: Date.now() - start,
        networkBlocked: options.networkBlocked,
      });
    });

    child.on("close", (code, signal) => {
      finish(code, signal);
    });
  });
}
