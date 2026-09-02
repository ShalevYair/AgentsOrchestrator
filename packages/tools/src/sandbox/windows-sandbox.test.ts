import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess, spawn, spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeCapabilities } from "./capabilities.js";
import { SandboxJailViolationError } from "./types.js";
import { WindowsSandbox } from "./windows-sandbox.js";

/**
 * Real Windows isn't available in this session's container, so these tests
 * inject fake `spawnFn`/`taskkillFn`/`pollMemoryBytes` to verify the
 * *decision logic* (taskkill invoked correctly on timeout, kill triggered
 * when polled memory exceeds the cap, truncation) rather than a real OS
 * process tree — see `windows-sandbox.ts`'s doc comment. CI's
 * `windows-latest` leg (P0-T5) is what exercises this against the real
 * `taskkill`/`wmic` binaries.
 */
function fakeChild(pid = 4321): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  Object.assign(child, { pid, stdout: new EventEmitter(), stderr: new EventEmitter() });
  return child;
}

describe("WindowsSandbox (logic verified via injected fakes, not a real Windows process tree)", () => {
  let stagingRoot: string;

  beforeEach(() => {
    stagingRoot = mkdtempSync(join(tmpdir(), "ao-sandbox-win-"));
  });
  afterEach(() => {
    rmSync(stagingRoot, { recursive: true, force: true });
  });

  it("capabilities never claim network blocking or full memory/CPU caps", () => {
    const capabilities = probeCapabilities("win32");
    expect(capabilities.networkBlocking).toBe(false);
    expect(capabilities.memoryCpuCaps).toBe("partial");
  });

  it("jail escape is rejected before spawnFn is ever called", async () => {
    const spawnFn = vi.fn() as unknown as typeof spawn;
    const sandbox = new WindowsSandbox(probeCapabilities("win32"), { spawnFn });
    await expect(
      sandbox.run({
        command: "python.exe",
        args: [],
        cwd: join(stagingRoot, "..", "outside"),
        stagingRoot,
        timeoutMs: 1000,
        maxOutputBytes: 1024,
        memoryMb: 64,
        network: false,
      }),
    ).rejects.toThrow(SandboxJailViolationError);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("timeout kills the process tree via taskkill /T /F on the child's pid", async () => {
    const child = fakeChild(4321);
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const taskkillFn = vi.fn(() => ({ status: 0 })) as unknown as typeof spawnSync;
    const sandbox = new WindowsSandbox(probeCapabilities("win32"), {
      spawnFn,
      taskkillFn,
      pollMemoryBytes: () => null,
      pollIntervalMs: 1_000_000, // effectively disabled for this test
    });

    const resultPromise = sandbox.run({
      command: "python.exe",
      args: ["script.py"],
      cwd: stagingRoot,
      stagingRoot,
      timeoutMs: 50,
      maxOutputBytes: 1024,
      memoryMb: 256,
      network: false,
    });

    // Wait past the 50ms timeout for the kill to fire, then simulate the OS
    // actually reaping the killed process.
    await new Promise((r) => setTimeout(r, 100));
    child.emit("close", null, "SIGTERM");

    const result = await resultPromise;
    expect(taskkillFn).toHaveBeenCalledWith("taskkill", ["/PID", "4321", "/T", "/F"], expect.anything());
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("a polled memory reading over the cap triggers a kill (partial/advisory enforcement)", async () => {
    const child = fakeChild(9999);
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const taskkillFn = vi.fn(() => ({ status: 0 })) as unknown as typeof spawnSync;
    const sandbox = new WindowsSandbox(probeCapabilities("win32"), {
      spawnFn,
      taskkillFn,
      pollMemoryBytes: () => 500 * 1024 * 1024, // always "over" a small cap
      pollIntervalMs: 10,
    });

    const resultPromise = sandbox.run({
      command: "python.exe",
      args: [],
      cwd: stagingRoot,
      stagingRoot,
      timeoutMs: 5000,
      maxOutputBytes: 1024,
      memoryMb: 64,
      network: false,
    });

    await new Promise((r) => setTimeout(r, 50));
    child.emit("close", null, "SIGTERM");

    const result = await resultPromise;
    expect(taskkillFn).toHaveBeenCalledWith("taskkill", ["/PID", "9999", "/T", "/F"], expect.anything());
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("memory limit exceeded");
  });

  it("truncates stdout at maxOutputBytes and flags it, never silently drops the overflow", async () => {
    const child = fakeChild(1111);
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const sandbox = new WindowsSandbox(probeCapabilities("win32"), {
      spawnFn,
      taskkillFn: vi.fn(() => ({ status: 0 })) as unknown as typeof spawnSync,
      pollMemoryBytes: () => null,
      pollIntervalMs: 1_000_000,
    });

    const resultPromise = sandbox.run({
      command: "python.exe",
      args: [],
      cwd: stagingRoot,
      stagingRoot,
      timeoutMs: 5000,
      maxOutputBytes: 10,
      memoryMb: 256,
      network: false,
    });

    child.stdout?.emit("data", Buffer.from("0123456789ABCDEF"));
    child.emit("close", 0, null);

    const result = await resultPromise;
    expect(result.truncated).toBe(true);
    expect(result.stdout).toBe("0123456789");
    expect(result.networkBlocked).toBe(false);
  });
});
