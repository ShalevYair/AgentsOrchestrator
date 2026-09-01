import { describe, expect, it } from "vitest";
import { LocalToolSchema, ToolResultSchema, type LocalTool } from "./local-tool.js";

/** Verbatim from PROTOCOLS.md §11. */
const EXAMPLE_TOOL: LocalTool = {
  id: "count-symbols",
  runtime: "python",
  source: "inline",
  script: "...",
  inputs: { paths: ["src/**/*.ts"] },
  limits: { timeoutMs: 60000, maxOutputBytes: 262144, memoryMb: 512, network: false },
  expectedOutput: "json",
};

describe("LocalToolSchema", () => {
  it("parses the example from PROTOCOLS.md §11 verbatim", () => {
    const tool = LocalToolSchema.parse(EXAMPLE_TOOL);
    expect(tool.limits.network).toBe(false);
  });

  it("accepts an arbitrary inputs shape for a different tool", () => {
    expect(() => LocalToolSchema.parse({ ...EXAMPLE_TOOL, inputs: { query: "select 1" } })).not.toThrow();
  });

  it("rejects network:true masquerading as a string", () => {
    const bad = { ...EXAMPLE_TOOL, limits: { ...EXAMPLE_TOOL.limits, network: "false" } };
    expect(() => LocalToolSchema.parse(bad as unknown)).toThrow();
  });
});

describe("ToolResultSchema", () => {
  it("parses the documented tool_result shape", () => {
    const result = ToolResultSchema.parse({
      t: "tool_result",
      toolId: "count-symbols",
      ok: true,
      data: { count: 12 },
      truncated: false,
    });
    expect(result.ok).toBe(true);
  });
});
