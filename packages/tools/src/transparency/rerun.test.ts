import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalTool } from "@ao/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runNodeTool } from "../runtime/node-runner.js";
import { detectSandbox } from "../sandbox/detect.js";
import { rerunTool } from "./rerun.js";
import { ToolRunLog } from "./tool-run-log.js";

const TOOL: LocalTool = {
  id: "count-runs",
  runtime: "node",
  source: "inline",
  script: "console.log(JSON.stringify({hello: 'world'}))",
  inputs: {},
  limits: { timeoutMs: 5000, maxOutputBytes: 4096, memoryMb: 256, network: false },
  expectedOutput: "json",
};

describe("rerunTool + ToolRunLog integration (real subprocess)", () => {
  let stagingRoot: string;
  const sandbox = detectSandbox();

  beforeEach(() => {
    stagingRoot = mkdtempSync(join(tmpdir(), "ao-rerun-staging-"));
  });
  afterEach(() => {
    rmSync(stagingRoot, { recursive: true, force: true });
  });

  it("runNodeTool/runPythonTool report every run into a supplied ToolRunLog", async () => {
    const runLog = new ToolRunLog();
    const result = await runNodeTool({ tool: TOOL, sandbox, stagingRoot, runLog });
    expect(result.ok).toBe(true);
    expect(runLog.list()).toHaveLength(1);
    expect(runLog.list()[0]?.tool.script).toBe(TOOL.script);
  });

  it("rerunTool re-executes the exact recorded LocalTool, producing a second real run", async () => {
    const runLog = new ToolRunLog();
    await runNodeTool({ tool: TOOL, sandbox, stagingRoot, runLog });
    const firstRecord = runLog.list()[0];
    if (!firstRecord) throw new Error("expected a recorded run");

    const secondResult = await rerunTool(firstRecord, { sandbox, stagingRoot, runLog });
    expect(secondResult.ok).toBe(true);
    expect(secondResult.data).toEqual({ hello: "world" });
    expect(runLog.list()).toHaveLength(2);
    expect(runLog.list()[1]?.tool.script).toBe(firstRecord.tool.script);
  });

  it("rerunTool throws a clear error for a python LocalTool without a venvRoot", async () => {
    const pythonTool: LocalTool = { ...TOOL, runtime: "python", script: "print('x')" };
    const runLog = new ToolRunLog();
    const record = runLog.record(
      pythonTool,
      {
        ok: true,
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
        truncated: false,
        timedOut: false,
        durationMs: 1,
        networkBlocked: true,
      },
      Date.now(),
    );
    await expect(rerunTool(record, { sandbox, stagingRoot })).rejects.toThrow(/venvRoot/);
  });
});
