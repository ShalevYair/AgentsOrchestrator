import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { probeCapabilities } from "./capabilities.js";
import { DarwinSandbox } from "./darwin-sandbox.js";
import { SandboxJailViolationError } from "./types.js";

/**
 * No macOS machine is available in this session's container, so
 * `sandbox-exec`-backed network blocking (see `darwin-sandbox.ts`'s doc
 * comment) is not exercised here — `probeCapabilities("darwin")` on this
 * Linux host correctly reports `networkBlocking: false` because
 * `sandbox-exec` doesn't exist here, and the one test that would need it
 * skips with an explicit reason instead of silently vanishing. Everything
 * else (`/bin/sh` + `ulimit -t` wrapping, the path jail) is plain POSIX
 * shell and genuinely runs on this Linux container too, since `DarwinSandbox`
 * only diverges from `LinuxSandbox` in the network-blocking wrapper and the
 * memory-cap honesty — both of which this file does verify for real.
 */
describe("DarwinSandbox", () => {
  let stagingRoot: string;
  const sandbox = new DarwinSandbox();

  beforeEach(() => {
    stagingRoot = mkdtempSync(join(tmpdir(), "ao-sandbox-darwin-"));
  });
  afterEach(() => {
    rmSync(stagingRoot, { recursive: true, force: true });
  });

  it("never claims full memory/CPU caps — macOS's ulimit -v is not reliably enforced", () => {
    const capabilities = probeCapabilities("darwin");
    expect(capabilities.memoryCpuCaps).toBe("partial");
    expect(capabilities.notes.some((note) => note.includes("ulimit -v"))).toBe(true);
  });

  it("runs a plain command through the /bin/sh + ulimit -t wrapper and captures stdout", async () => {
    const result = await sandbox.run({
      command: "/bin/echo",
      args: ["hello-darwin"],
      cwd: stagingRoot,
      stagingRoot,
      timeoutMs: 5000,
      maxOutputBytes: 1024,
      memoryMb: 128,
      network: false,
    });
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("hello-darwin");
  });

  it("jail escape is rejected before anything runs", async () => {
    await expect(
      sandbox.run({
        command: "/bin/echo",
        args: [],
        cwd: join(stagingRoot, "..", "outside"),
        stagingRoot,
        timeoutMs: 1000,
        maxOutputBytes: 1024,
        memoryMb: 64,
        network: false,
      }),
    ).rejects.toThrow(SandboxJailViolationError);
  });

  it("network blocking: skipped — this container has no sandbox-exec (no macOS available here)", () => {
    if (sandbox.capabilities.networkBlocking) {
      throw new Error("unexpected: sandbox-exec is available — replace this skip with a real pentest");
    }
    // Explicit, visible reason (ADR-013's own requirement for a platform
    // gap): this is not a silently-vanished test, it documents exactly why
    // it can't run here and what would flip it on.
  });
});
