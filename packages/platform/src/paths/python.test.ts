import { describe, expect, it, vi } from "vitest";
import type * as NodeOs from "node:os";
import { discoverPython, meetsMinimumPythonVersion } from "./python.js";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

const { spawnSync } = await import("node:child_process");
const mockedSpawnSync = vi.mocked(spawnSync);

describe("candidatesForPlatform", () => {
  // Developed on Linux, but this branch is exactly the kind of Windows-only
  // path ADR-011 (docs/DECISIONS.md) exists to make sure isn't just assumed
  // to work — mock node:os rather than skip it.
  it("puts the `py -3` launcher first on win32", async () => {
    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof NodeOs>("node:os");
      return { ...actual, platform: () => "win32" as const };
    });
    vi.resetModules();
    try {
      const reloaded = await import("./python.js");
      expect(reloaded.candidatesForPlatform()).toEqual([
        { command: "py", args: ["-3"] },
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ]);
    } finally {
      vi.doUnmock("node:os");
      vi.resetModules();
    }
  });

  it("uses python3/python (no py launcher) on non-Windows platforms", async () => {
    // Mock explicitly rather than relying on the host OS: this suite runs
    // on all three CI platforms, including windows-latest, where the
    // *actual* platform() is "win32" and this expectation would be wrong.
    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof NodeOs>("node:os");
      return { ...actual, platform: () => "linux" as const };
    });
    vi.resetModules();
    try {
      const reloaded = await import("./python.js");
      expect(reloaded.candidatesForPlatform()).toEqual([
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ]);
    } finally {
      vi.doUnmock("node:os");
      vi.resetModules();
    }
  });
});

describe("discoverPython", () => {
  it("returns the first candidate that resolves successfully", () => {
    mockedSpawnSync
      .mockReturnValueOnce({
        status: null,
        error: new Error("ENOENT"),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: "Python 3.12.1\n",
        stderr: "",
        error: undefined,
      } as unknown as ReturnType<typeof spawnSync>);

    const result = discoverPython([
      { command: "python3", args: [] },
      { command: "python", args: [] },
    ]);

    expect(result).toEqual({ command: "python", args: [], version: "3.12.1" });
    expect(mockedSpawnSync).toHaveBeenCalledTimes(2);
  });

  it("passes argv as a literal array with shell disabled — never a concatenated shell string", () => {
    mockedSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: "Python 3.11.0\n",
      stderr: "",
      error: undefined,
    } as unknown as ReturnType<typeof spawnSync>);

    discoverPython([{ command: "py", args: ["-3"] }]);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      "py",
      ["-3", "--version"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("returns null when no candidate resolves", () => {
    mockedSpawnSync.mockReturnValue({
      status: null,
      error: new Error("ENOENT"),
    } as ReturnType<typeof spawnSync>);

    const result = discoverPython([
      { command: "python3", args: [] },
      { command: "python", args: [] },
    ]);

    expect(result).toBeNull();
  });

  it("returns null when a command exists but exits non-zero", () => {
    mockedSpawnSync.mockReturnValueOnce({
      status: 1,
      stdout: "",
      stderr: "some error",
      error: undefined,
    } as unknown as ReturnType<typeof spawnSync>);

    expect(discoverPython([{ command: "python3", args: [] }])).toBeNull();
  });
});

describe("meetsMinimumPythonVersion", () => {
  it("accepts a version above the default minimum (3.11.0)", () => {
    expect(meetsMinimumPythonVersion("3.11.15")).toBe(true);
    expect(meetsMinimumPythonVersion("3.12.0")).toBe(true);
    expect(meetsMinimumPythonVersion("4.0.0")).toBe(true);
  });

  it("rejects a version below the default minimum", () => {
    expect(meetsMinimumPythonVersion("3.9.7")).toBe(false);
    expect(meetsMinimumPythonVersion("2.7.18")).toBe(false);
  });

  it("accepts exactly the minimum version", () => {
    expect(meetsMinimumPythonVersion("3.11.0")).toBe(true);
  });

  it("supports a custom minimum", () => {
    expect(meetsMinimumPythonVersion("3.10.0", "3.12.0")).toBe(false);
  });
});

describe("discoverPython (real integration smoke test, not mocked)", () => {
  it("either finds a well-formed interpreter or gracefully returns null — never throws", async () => {
    vi.doUnmock("node:child_process");
    vi.resetModules();
    const real = await import("./python.js");
    let thrown: unknown;
    let result: ReturnType<typeof real.discoverPython> = null;
    try {
      result = real.discoverPython();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeUndefined();
    if (result !== null) {
      expect(result.command.length).toBeGreaterThan(0);
      expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
