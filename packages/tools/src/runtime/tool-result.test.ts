import type { LocalTool } from "@ao/shared";
import { describe, expect, it } from "vitest";
import type { SandboxRunResult } from "../sandbox/types.js";
import { buildToolResult } from "./tool-result.js";

const TOOL: LocalTool = {
  id: "t1",
  runtime: "python",
  source: "inline",
  script: "...",
  inputs: {},
  limits: { timeoutMs: 1000, maxOutputBytes: 1024, memoryMb: 64, network: false },
  expectedOutput: "json",
};

function run(overrides: Partial<SandboxRunResult>): SandboxRunResult {
  return {
    ok: true,
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    truncated: false,
    timedOut: false,
    durationMs: 1,
    networkBlocked: true,
    ...overrides,
  };
}

describe("buildToolResult", () => {
  it("a failed run (timeout) is reported ok:false with the timeout reason, truncated carried through", () => {
    const result = buildToolResult(TOOL, run({ ok: false, timedOut: true, truncated: true }));
    expect(result.ok).toBe(false);
    expect(result.truncated).toBe(true);
    expect((result.data as { error: string }).error).toBe("timeout");
  });

  it("a failed run (non-zero exit) is reported with the exit code", () => {
    const result = buildToolResult(TOOL, run({ ok: false, exitCode: 1, stderr: "Traceback..." }));
    expect(result.ok).toBe(false);
    expect((result.data as { exitCode: number }).exitCode).toBe(1);
  });

  it("json expectedOutput: valid JSON stdout parses into `data`", () => {
    const result = buildToolResult(TOOL, run({ stdout: '{"count": 5}' }));
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ count: 5 });
  });

  it("json expectedOutput: invalid JSON on a clean exit is reported ok:false, raw output preserved", () => {
    const result = buildToolResult(TOOL, run({ stdout: "not json at all" }));
    expect(result.ok).toBe(false);
    expect((result.data as { raw: string }).raw).toBe("not json at all");
  });

  it("text expectedOutput: raw stdout passed through unparsed", () => {
    const result = buildToolResult({ ...TOOL, expectedOutput: "text" }, run({ stdout: "hello\n" }));
    expect(result.ok).toBe(true);
    expect(result.data).toBe("hello\n");
  });

  it("truncated is always carried through even on success", () => {
    const result = buildToolResult(
      { ...TOOL, expectedOutput: "text" },
      run({ stdout: "abc", truncated: true }),
    );
    expect(result.truncated).toBe(true);
  });
});
