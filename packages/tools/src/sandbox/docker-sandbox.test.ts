import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess, spawn, spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DockerSandbox, detectDockerSandbox, probeDockerAvailable } from "./docker-sandbox.js";
import { SandboxJailViolationError } from "./types.js";

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  Object.assign(child, { stdout: new EventEmitter(), stderr: new EventEmitter() });
  return child;
}

/**
 * `probeDockerAvailable`'s "real daemon" test is genuine, not simulated:
 * this session started `dockerd` in the background specifically to verify
 * this (see the P7-T7 commit notes) — `docker info` really succeeds here.
 * Everything else in this file uses an injected `spawnFn`/`spawnSyncFn`
 * because a real container run needs an image pull, which this
 * environment's egress proxy blocks (see `docker-sandbox.ts`'s doc comment).
 */
describe("probeDockerAvailable", () => {
  it("is true against the live daemon this session started for real", () => {
    expect(probeDockerAvailable()).toBe(true);
  });

  it("is false, never throws, when the docker CLI errors", () => {
    const throwing = vi.fn(() => ({
      status: null,
      error: new Error("ENOENT"),
    })) as unknown as typeof spawnSync;
    expect(probeDockerAvailable(throwing)).toBe(false);
  });
});

describe("detectDockerSandbox", () => {
  it("returns null gracefully (not an error) when Docker isn't available", () => {
    const unavailable = vi.fn(() => ({ status: 1, error: undefined })) as unknown as typeof spawnSync;
    expect(detectDockerSandbox("node:22-slim", unavailable)).toBeNull();
  });

  it("returns a real DockerSandbox instance when Docker is available", () => {
    const available = vi.fn(() => ({ status: 0, error: undefined })) as unknown as typeof spawnSync;
    expect(detectDockerSandbox("node:22-slim", available)).toBeInstanceOf(DockerSandbox);
  });
});

describe("DockerSandbox (docker run argv + kill logic verified via injected fakes)", () => {
  let stagingRoot: string;

  beforeEach(() => {
    stagingRoot = mkdtempSync(join(tmpdir(), "ao-sandbox-docker-"));
  });
  afterEach(() => {
    rmSync(stagingRoot, { recursive: true, force: true });
  });

  it("capabilities report full isolation on every axis — Docker doesn't need the platform-specific caveats", () => {
    const sandbox = new DockerSandbox("node:22-slim");
    expect(sandbox.capabilities.networkBlocking).toBe(true);
    expect(sandbox.capabilities.memoryCpuCaps).toBe("full");
    expect(sandbox.capabilities.notes).toEqual([]);
  });

  it("jail escape is rejected before spawnFn is ever called", async () => {
    const spawnFn = vi.fn() as unknown as typeof spawn;
    const sandbox = new DockerSandbox("node:22-slim", { spawnFn });
    await expect(
      sandbox.run({
        command: "node",
        args: [],
        cwd: join(stagingRoot, "..", "outside"),
        stagingRoot,
        timeoutMs: 1000,
        maxOutputBytes: 1024,
        memoryMb: 128,
        network: false,
      }),
    ).rejects.toThrow(SandboxJailViolationError);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("builds the expected docker run argv: --network none, --memory, volume mount, workdir, image, command", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const sandbox = new DockerSandbox("node:22-slim", { spawnFn });

    const resultPromise = sandbox.run({
      command: "node",
      args: ["script.js", "inputs.json"],
      cwd: stagingRoot,
      stagingRoot,
      timeoutMs: 5000,
      maxOutputBytes: 1024,
      memoryMb: 256,
      network: false,
    });
    child.emit("close", 0, null);
    await resultPromise;

    expect(spawnFn).toHaveBeenCalledWith(
      "docker",
      [
        "run",
        "--rm",
        "--name",
        expect.stringMatching(/^ao-sandbox-/),
        "--network",
        "none",
        "--memory",
        "256m",
        "--pids-limit",
        "256",
        "-v",
        `${stagingRoot}:/workspace`,
        "-w",
        "/workspace",
        "node:22-slim",
        "node",
        "script.js",
        "inputs.json",
      ],
      expect.anything(),
    );
  });

  it("network:true maps to --network bridge, and networkBlocked reflects what was actually requested", async () => {
    const child = fakeChild();
    const rawSpawnFn = vi.fn(() => child);
    const sandbox = new DockerSandbox("node:22-slim", { spawnFn: rawSpawnFn as unknown as typeof spawn });

    const resultPromise = sandbox.run({
      command: "node",
      args: [],
      cwd: stagingRoot,
      stagingRoot,
      timeoutMs: 5000,
      maxOutputBytes: 1024,
      memoryMb: 256,
      network: true,
    });
    child.emit("close", 0, null);
    const result = await resultPromise;

    const [, args] = rawSpawnFn.mock.calls[0] as unknown as [string, string[]];
    expect(args).toContain("bridge");
    expect(result.networkBlocked).toBe(false);
  });

  it("a subdirectory cwd under stagingRoot maps to a nested path under /workspace", async () => {
    const child = fakeChild();
    const rawSpawnFn = vi.fn(() => child);
    const sandbox = new DockerSandbox("node:22-slim", { spawnFn: rawSpawnFn as unknown as typeof spawn });

    const resultPromise = sandbox.run({
      command: "node",
      args: [],
      cwd: join(stagingRoot, "run-1"),
      stagingRoot,
      timeoutMs: 5000,
      maxOutputBytes: 1024,
      memoryMb: 256,
      network: false,
    });
    child.emit("close", 0, null);
    await resultPromise;

    const [, args] = rawSpawnFn.mock.calls[0] as unknown as [string, string[]];
    const workdirIndex = args.indexOf("-w");
    expect(args[workdirIndex + 1]).toBe("/workspace/run-1");
  });

  it("timeout runs `docker kill <containerName>` via spawnSyncFn", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const spawnSyncFn = vi.fn(() => ({ status: 0, error: undefined })) as unknown as typeof spawnSync;
    const sandbox = new DockerSandbox("node:22-slim", { spawnFn, spawnSyncFn });

    const resultPromise = sandbox.run({
      command: "node",
      args: [],
      cwd: stagingRoot,
      stagingRoot,
      timeoutMs: 50,
      maxOutputBytes: 1024,
      memoryMb: 256,
      network: false,
    });

    await new Promise((r) => setTimeout(r, 100));
    child.emit("close", null, "SIGKILL");
    const result = await resultPromise;

    expect(spawnSyncFn).toHaveBeenCalledWith(
      "docker",
      ["kill", expect.stringMatching(/^ao-sandbox-/)],
      expect.anything(),
    );
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("truncates stdout at maxOutputBytes and flags it", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const sandbox = new DockerSandbox("node:22-slim", { spawnFn });

    const resultPromise = sandbox.run({
      command: "node",
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
  });
});
