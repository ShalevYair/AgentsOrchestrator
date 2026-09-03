import type { LocalTool } from "@ao/shared";
import { describe, expect, it } from "vitest";
import type { SandboxRunResult } from "../sandbox/types.js";
import { ToolRunLog, toToolExecutedEvent } from "./tool-run-log.js";

const TOOL: LocalTool = {
  id: "t1",
  runtime: "node",
  source: "inline",
  script: "console.log('line 1')\nconsole.log('line 2')",
  inputs: {},
  limits: { timeoutMs: 1000, maxOutputBytes: 10, memoryMb: 128, network: false },
  expectedOutput: "text",
};

function fakeRun(overrides: Partial<SandboxRunResult> = {}): SandboxRunResult {
  return {
    ok: true,
    exitCode: 0,
    signal: null,
    stdout: "hello world, this is long enough to be truncated",
    stderr: "",
    truncated: true,
    timedOut: false,
    durationMs: 42,
    networkBlocked: true,
    ...overrides,
  };
}

describe("ToolRunLog", () => {
  it("records the full script even when the run's own output was truncated", () => {
    const log = new ToolRunLog();
    const record = log.record(TOOL, fakeRun(), Date.now());
    expect(record.tool.script).toBe(TOOL.script);
    expect(record.truncated).toBe(true);
  });

  it("assigns increasing runIds and lists every recorded run", () => {
    const log = new ToolRunLog();
    const first = log.record(TOOL, fakeRun(), Date.now());
    const second = log.record(TOOL, fakeRun({ exitCode: 1, ok: false }), Date.now());
    expect(first.runId).not.toBe(second.runId);
    expect(log.list()).toHaveLength(2);
    expect(log.get(first.runId)?.exitCode).toBe(0);
    expect(log.get(second.runId)?.exitCode).toBe(1);
  });

  it("get() returns undefined for an unknown runId", () => {
    const log = new ToolRunLog();
    expect(log.get("does-not-exist")).toBeUndefined();
  });

  it("computes finishedAt from startedAt + durationMs", () => {
    const log = new ToolRunLog();
    const startedAtMs = 1_700_000_000_000;
    const record = log.record(TOOL, fakeRun({ durationMs: 5000 }), startedAtMs);
    expect(new Date(record.finishedAt).getTime() - new Date(record.startedAt).getTime()).toBe(5000);
  });

  it("toToolExecutedEvent matches PROTOCOLS.md §9's tool.executed payload shape exactly", () => {
    const log = new ToolRunLog();
    const record = log.record(TOOL, fakeRun({ exitCode: 0, durationMs: 123 }), Date.now());
    const event = toToolExecutedEvent(record);
    expect(event).toEqual({
      toolId: TOOL.id,
      script: TOOL.script,
      exitCode: 0,
      durationMs: 123,
      outputSize: record.outputBytes,
    });
  });
});
