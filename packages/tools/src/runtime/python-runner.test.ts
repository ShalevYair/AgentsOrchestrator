import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalTool } from "@ao/shared";
import { discoverPython } from "@ao/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectSandbox } from "../sandbox/detect.js";
import { runPythonTool, PythonInterpreterNotFoundError } from "./python-runner.js";

const interpreter = discoverPython();
const describeIfPython = interpreter ? describe : describe.skip;

function baseTool(overrides: Partial<LocalTool>): LocalTool {
  return {
    id: "test-tool",
    runtime: "python",
    source: "inline",
    script: "print('unset')",
    inputs: {},
    limits: { timeoutMs: 15_000, maxOutputBytes: 65_536, memoryMb: 256, network: false },
    expectedOutput: "json",
    ...overrides,
  };
}

// Explicit, visible reason if this whole suite is skipped: no Python 3
// interpreter was found on PATH in this environment (`describeIfPython`
// above), rather than these tests silently vanishing from the report.
describeIfPython("runPythonTool (real subprocess, real Sandbox for this platform)", () => {
  let stagingRoot: string;
  let venvRoot: string;
  const sandbox = detectSandbox();

  beforeEach(() => {
    stagingRoot = mkdtempSync(join(tmpdir(), "ao-py-staging-"));
    venvRoot = mkdtempSync(join(tmpdir(), "ao-py-venv-"));
  });
  afterEach(() => {
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(venvRoot, { recursive: true, force: true });
  });

  it("rejects a non-python LocalTool", async () => {
    await expect(
      runPythonTool({
        tool: baseTool({ runtime: "node" }),
        sandbox,
        stagingRoot,
        venvRoot,
      }),
    ).rejects.toThrow(/non-python/);
  });

  it("throws PythonInterpreterNotFoundError when discovery is forced to fail", async () => {
    await expect(
      runPythonTool({
        tool: baseTool({}),
        sandbox,
        stagingRoot,
        venvRoot,
        interpreter: null,
      }),
    ).rejects.toThrow(PythonInterpreterNotFoundError);
  });

  it("stdlib only: runs, parses JSON output, no venv packages needed", async () => {
    const tool = baseTool({
      script: "import json\nprint(json.dumps({'sum': 1 + 2}))\n",
    });
    const result = await runPythonTool({ tool, sandbox, stagingRoot, venvRoot });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ sum: 3 });
    expect(result.truncated).toBe(false);
  }, 30_000);

  it("Hebrew round-trips correctly through forced utf-8 encoding", async () => {
    const hebrew = "שלום עולם — בדיקת קידוד";
    const tool = baseTool({
      script: [
        "import json, sys",
        `payload = ${JSON.stringify(hebrew)}`,
        "print(json.dumps({'text': payload}, ensure_ascii=False))",
      ].join("\n"),
    });
    const result = await runPythonTool({ tool, sandbox, stagingRoot, venvRoot });
    expect(result.ok).toBe(true);
    expect((result.data as { text: string }).text).toBe(hebrew);
  }, 30_000);

  it("output over the cap is truncated and flagged, never silently dropped", async () => {
    const tool = baseTool({
      script: "print('x' * 5000)",
      expectedOutput: "text",
      limits: { timeoutMs: 10_000, maxOutputBytes: 100, memoryMb: 128, network: false },
    });
    const result = await runPythonTool({ tool, sandbox, stagingRoot, venvRoot });
    expect(result.truncated).toBe(true);
    expect((result.data as string).length).toBeLessThanOrEqual(100);
  }, 30_000);

  it("package allowlist: an import outside the allowlist fails at runtime — the venv never has it", async () => {
    const tool = baseTool({
      script: "import this_package_does_not_exist_and_is_not_allowlisted\n",
      expectedOutput: "text",
    });
    const result = await runPythonTool({ tool, sandbox, stagingRoot, venvRoot });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.data)).toMatch(/ModuleNotFoundError|ImportError/);
  }, 30_000);

  it("pandas + numpy: both installed into one isolated venv and actually importable (network required)", async () => {
    const tool = baseTool({
      script: [
        "import json",
        "import numpy as np",
        "import pandas as pd",
        "df = pd.DataFrame({'a': [1, 2, 3]})",
        "print(json.dumps({'sum': int(np.array(df['a']).sum())}))",
      ].join("\n"),
      // Empirically, importing pandas alone needs >256MB of virtual
      // address space (`ulimit -v`) just to load its submodules — verified
      // directly: 256MB reliably MemoryErrors mid-import, 384MB+ doesn't.
      // 512MB leaves margin without weakening the point of this test.
      limits: { timeoutMs: 15_000, maxOutputBytes: 65_536, memoryMb: 512, network: false },
    });
    const result = await runPythonTool({ tool, sandbox, stagingRoot, venvRoot });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ sum: 6 });
  }, 300_000);
});
