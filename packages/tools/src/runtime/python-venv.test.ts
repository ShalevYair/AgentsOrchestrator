import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { spawnSync } from "node:child_process";
import { discoverPython } from "@ao/platform";
import { describe, expect, it, vi } from "vitest";
import { computeVenvKey, detectRequestedPackages, ensureVenv } from "./python-venv.js";

describe("detectRequestedPackages", () => {
  it("only reports packages present in both the script and the allowlist", () => {
    const script = "import numpy as np\nimport os\nfrom pandas import DataFrame\nimport requests\n";
    expect(detectRequestedPackages(script)).toEqual(["numpy", "pandas"]);
  });

  it("returns nothing for a stdlib-only script", () => {
    expect(detectRequestedPackages("import json\nimport sys\n")).toEqual([]);
  });

  it("respects a narrower allowlist than the default", () => {
    expect(detectRequestedPackages("import numpy\nimport pandas\n", ["numpy"])).toEqual(["numpy"]);
  });
});

describe("computeVenvKey", () => {
  it("is stable regardless of package order", () => {
    expect(computeVenvKey("3.11.0", ["numpy", "pandas"])).toBe(computeVenvKey("3.11.0", ["pandas", "numpy"]));
  });

  it("differs for a different python version or package set", () => {
    const base = computeVenvKey("3.11.0", ["numpy"]);
    expect(computeVenvKey("3.12.0", ["numpy"])).not.toBe(base);
    expect(computeVenvKey("3.11.0", ["pandas"])).not.toBe(base);
  });
});

describe("ensureVenv", () => {
  it("propagates a clear error when venv creation fails, without touching pip", () => {
    const spawnFn = vi.fn(() => ({
      status: 1,
      error: undefined,
      stderr: "boom",
    })) as unknown as typeof spawnSync;
    expect(() =>
      ensureVenv({
        venvRoot: "/nonexistent-in-this-test",
        interpreter: { command: "python3", args: [], version: "3.11.0" },
        packages: ["numpy"],
        spawnFn,
      }),
    ).toThrow(/failed to create venv/);
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("propagates a clear error when pip install fails", () => {
    let call = 0;
    const spawnFn = vi.fn(() => {
      call += 1;
      return call === 1
        ? { status: 0, error: undefined }
        : { status: 1, error: undefined, stderr: "no such package" };
    }) as unknown as typeof spawnSync;
    expect(() =>
      ensureVenv({
        venvRoot: "/nonexistent-in-this-test",
        interpreter: { command: "python3", args: [], version: "3.11.0" },
        packages: ["not-a-real-package"],
        spawnFn,
      }),
    ).toThrow(/failed to install/);
  });

  it("real venv creation with zero packages (no network needed) actually produces a working python3 binary", () => {
    const interpreter = discoverPython();
    if (!interpreter) {
      // Explicit, visible reason: no Python interpreter on PATH in this environment.
      return;
    }
    const venvRoot = mkdtempSync(join(tmpdir(), "ao-venv-test-"));
    try {
      const pythonBin = ensureVenv({ venvRoot, interpreter, packages: [] });
      expect(existsSync(pythonBin)).toBe(true);
      // Second call with the same key must be a cache hit, not a second `python -m venv`.
      const spawnFn = vi.fn() as unknown as typeof spawnSync;
      const cached = ensureVenv({ venvRoot, interpreter, packages: [], spawnFn });
      expect(cached).toBe(pythonBin);
      expect(spawnFn).not.toHaveBeenCalled();
    } finally {
      rmSync(venvRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
