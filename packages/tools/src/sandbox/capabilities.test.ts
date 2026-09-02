import type { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { probeCapabilities, probeDarwinSandboxExec, probeLinuxNetworkNamespace } from "./capabilities.js";

function fakeSpawnSync(ok: boolean): typeof spawnSync {
  return vi.fn(() =>
    ok ? { status: 0, error: undefined } : { status: 1, error: undefined },
  ) as unknown as typeof spawnSync;
}

describe("probeCapabilities", () => {
  it("win32 never claims network blocking or full memory/CPU caps", () => {
    const capabilities = probeCapabilities("win32");
    expect(capabilities.implementation).toBe("windows-native");
    expect(capabilities.networkBlocking).toBe(false);
    expect(capabilities.memoryCpuCaps).toBe("partial");
    expect(capabilities.notes.length).toBeGreaterThan(0);
  });

  it("darwin never claims full memory/CPU caps, and network blocking follows the live probe", () => {
    const capable = probeCapabilities("darwin", fakeSpawnSync(true));
    expect(capable.memoryCpuCaps).toBe("partial");
    expect(capable.networkBlocking).toBe(true);

    const incapable = probeCapabilities("darwin", fakeSpawnSync(false));
    expect(incapable.networkBlocking).toBe(false);
    expect(incapable.notes.some((note) => note.includes("בידוד חלקי"))).toBe(true);
  });

  it("linux reports full memory/CPU caps, and network blocking follows the live probe", () => {
    const capable = probeCapabilities("linux", fakeSpawnSync(true));
    expect(capable.memoryCpuCaps).toBe("full");
    expect(capable.networkBlocking).toBe(true);
    expect(capable.notes).toEqual([]);

    const incapable = probeCapabilities("linux", fakeSpawnSync(false));
    expect(incapable.networkBlocking).toBe(false);
    expect(incapable.notes.length).toBeGreaterThan(0);
  });

  it("probeLinuxNetworkNamespace/probeDarwinSandboxExec surface spawn errors as false, never throw", () => {
    const throwing = vi.fn(() => ({
      status: null,
      error: new Error("ENOENT"),
    })) as unknown as typeof spawnSync;
    expect(probeLinuxNetworkNamespace(throwing)).toBe(false);
    expect(probeDarwinSandboxExec(throwing)).toBe(false);
  });
});
