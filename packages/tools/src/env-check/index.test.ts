import { describe, expect, it, vi } from "vitest";
import { checkDocker, checkEnvironment, checkNode, checkPython } from "./index.js";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
  // docker-sandbox.ts imports `spawn` too (for actually running a container,
  // unused by these probes) — mocking the whole module needs it defined.
  spawn: vi.fn(),
}));

const { spawnSync } = await import("node:child_process");
const mockedSpawnSync = vi.mocked(spawnSync);

/** Every command not explicitly handled resolves like a real ENOENT — never `undefined`, which would throw on `.error` access inside the probes under test. */
type SpawnResult = ReturnType<typeof spawnSync>;
const ENOENT: SpawnResult = { status: null, error: new Error("ENOENT") } as SpawnResult;

function mockCommands(handlers: Record<string, SpawnResult>): void {
  mockedSpawnSync.mockImplementation((command: string) => handlers[command] ?? ENOENT);
}

const PYTHON_OK: SpawnResult = {
  status: 0,
  stdout: "Python 3.12.1\n",
  stderr: "",
  error: undefined,
} as unknown as SpawnResult;

const DOCKER_OK: SpawnResult = {
  status: 0,
  stdout: "27.3.1\n",
  stderr: "",
  error: undefined,
} as unknown as SpawnResult;

describe("checkNode", () => {
  it("is ok for Node 22+", () => {
    expect(checkNode("22.22.0")).toEqual({
      version: "22.22.0",
      majorVersion: 22,
      minMajorVersion: 22,
      ok: true,
    });
  });

  it("is not ok below Node 22", () => {
    const result = checkNode("18.19.0");
    expect(result.ok).toBe(false);
    expect(result.majorVersion).toBe(18);
  });
});

describe("checkPython", () => {
  it("reports available+ok when a modern interpreter is found", () => {
    mockCommands({ py: PYTHON_OK, python3: PYTHON_OK, python: PYTHON_OK });
    const result = checkPython("linux");
    expect(result.command).toBeTruthy();
    expect(result).toEqual({
      available: true,
      version: "3.12.1",
      command: result.command,
      minVersion: "3.11.0",
      ok: true,
      installInstructions: null,
    });
  });

  it("gives Windows-specific instructions (python.org, not apt) when missing on win32", () => {
    mockCommands({});
    const result = checkPython("win32");
    expect(result.available).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.installInstructions).toContain("python.org");
    // The message may *mention* apt to say it doesn't apply, but must never
    // tell a Windows user to run it — that's the literal bug this guards.
    expect(result.installInstructions?.toLowerCase()).not.toContain("sudo apt");
  });

  it("gives Linux-specific instructions (distro package manager) when missing on linux", () => {
    mockCommands({});
    const result = checkPython("linux");
    expect(result.installInstructions).toContain("apt");
  });

  it("gives Homebrew/python.org instructions when missing on darwin", () => {
    mockCommands({});
    const result = checkPython("darwin");
    expect(result.installInstructions).toContain("python.org");
    expect(result.installInstructions).toContain("brew");
  });

  it("flags a too-old interpreter as not ok, with an explanation naming the found version", () => {
    const oldPython: SpawnResult = {
      status: 0,
      stdout: "Python 2.7.18\n",
      stderr: "",
      error: undefined,
    } as unknown as SpawnResult;
    mockCommands({ py: oldPython, python3: oldPython, python: oldPython });
    const result = checkPython("linux");
    expect(result.available).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.installInstructions).toContain("2.7.18");
  });
});

describe("checkDocker", () => {
  it("is available when `docker info` succeeds", () => {
    mockCommands({ docker: DOCKER_OK });
    expect(checkDocker()).toEqual({ available: true });
  });

  it("is unavailable when docker is missing", () => {
    mockCommands({});
    expect(checkDocker()).toEqual({ available: false });
  });
});

describe("checkEnvironment", () => {
  it("never throws, and surfaces the real Windows-native isolation level when Docker is unavailable", () => {
    mockCommands({});
    const report = checkEnvironment("win32");
    expect(report.docker.available).toBe(false);
    expect(report.sandbox.implementation).toBe("windows-native");
    expect(report.sandbox.networkBlocking).toBe(false);
    expect(report.sandbox.notes.length).toBeGreaterThan(0);
  });

  it("composes all four probes for a fully-available machine", () => {
    mockCommands({ py: PYTHON_OK, python3: PYTHON_OK, python: PYTHON_OK, docker: DOCKER_OK });
    const report = checkEnvironment("linux");
    expect(report.node.ok).toBe(true);
    expect(report.python.ok).toBe(true);
    expect(report.docker.available).toBe(true);
    expect(report.sandbox.implementation).toBe("linux");
  });

  it("a missing Python never throws — it only shows up as python.ok:false", () => {
    mockCommands({});
    expect(() => checkEnvironment("linux")).not.toThrow();
    expect(checkEnvironment("linux").python.ok).toBe(false);
  });
});

describe("checkEnvironment (real, not mocked)", () => {
  it("either finds real tools or degrades gracefully — never throws", async () => {
    vi.doUnmock("node:child_process");
    vi.resetModules();
    const real = await import("./index.js");
    expect(() => real.checkEnvironment()).not.toThrow();
    const report = real.checkEnvironment();
    expect(report.node.majorVersion).toBeGreaterThan(0);
    expect(typeof report.docker.available).toBe("boolean");
  });
});
