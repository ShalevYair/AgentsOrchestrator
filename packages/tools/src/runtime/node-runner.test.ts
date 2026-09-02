import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalTool } from "@ao/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectSandbox } from "../sandbox/detect.js";
import { runNodeTool } from "./node-runner.js";

function baseTool(overrides: Partial<LocalTool>): LocalTool {
  return {
    id: "test-node-tool",
    runtime: "node",
    source: "inline",
    script: "console.log(JSON.stringify({ok: true}))",
    inputs: {},
    limits: { timeoutMs: 15_000, maxOutputBytes: 65_536, memoryMb: 256, network: false },
    expectedOutput: "json",
    ...overrides,
  };
}

describe("runNodeTool (real subprocess, real Sandbox for this platform)", () => {
  let stagingRoot: string;
  const sandbox = detectSandbox();

  beforeEach(() => {
    stagingRoot = mkdtempSync(join(tmpdir(), "ao-node-staging-"));
  });
  afterEach(() => {
    rmSync(stagingRoot, { recursive: true, force: true });
  });

  it("rejects a non-node LocalTool", async () => {
    await expect(
      runNodeTool({ tool: baseTool({ runtime: "python" }), sandbox, stagingRoot }),
    ).rejects.toThrow(/non-node/);
  });

  it("runs and parses JSON output, using inputs.json written alongside the script", async () => {
    const tool = baseTool({
      script: [
        "const fs = require('fs');",
        "const inputs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
        "console.log(JSON.stringify({ echoed: inputs.value }));",
      ].join("\n"),
      inputs: { value: 42 },
    });
    const result = await runNodeTool({ tool, sandbox, stagingRoot });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ echoed: 42 });
  });

  it("Hebrew round-trips through a piped stdout with no special encoding flag needed", async () => {
    const hebrew = "שלום עולם — בדיקת קידוד";
    const tool = baseTool({
      script: `console.log(JSON.stringify({ text: ${JSON.stringify(hebrew)} }));`,
    });
    const result = await runNodeTool({ tool, sandbox, stagingRoot });
    expect(result.ok).toBe(true);
    expect((result.data as { text: string }).text).toBe(hebrew);
  });

  it("output over the cap is truncated and flagged, never silently dropped", async () => {
    const tool = baseTool({
      script: "console.log('x'.repeat(5000));",
      expectedOutput: "text",
      limits: { timeoutMs: 10_000, maxOutputBytes: 100, memoryMb: 128, network: false },
    });
    const result = await runNodeTool({ tool, sandbox, stagingRoot });
    expect(result.truncated).toBe(true);
    expect((result.data as string).length).toBeLessThanOrEqual(100);
  });

  it("a script that throws is reported as a failed ToolResult, not an unhandled crash of the caller", async () => {
    const tool = baseTool({
      script: "throw new Error('boom');",
      expectedOutput: "text",
    });
    const result = await runNodeTool({ tool, sandbox, stagingRoot });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.data)).toContain("boom");
  });
});
