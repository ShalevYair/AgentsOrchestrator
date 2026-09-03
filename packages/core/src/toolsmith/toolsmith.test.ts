import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLLMProvider } from "@ao/providers";
import type { LocalTool } from "@ao/shared";
import { detectSandbox, matchLibraryTool, runNodeTool } from "@ao/tools";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import { buildToolsmithPrompt, runToolsmith, type RunLocalTool } from "./toolsmith.js";

const SIMPLE_TOOL: LocalTool = {
  id: "count-files",
  runtime: "node",
  source: "inline",
  script: "console.log(JSON.stringify({count: 1}))",
  inputs: {},
  limits: { timeoutMs: 5000, maxOutputBytes: 4096, memoryMb: 128, network: false },
  expectedOutput: "json",
};

describe("buildToolsmithPrompt", () => {
  it("includes the user request and data description but has no way to smuggle in raw content", () => {
    const prompt = buildToolsmithPrompt({
      userRequest: "how many files import X",
      dataDescription: "10,000 .js files under a directory",
    });
    expect(prompt).toContain("how many files import X");
    expect(prompt).toContain("10,000 .js files under a directory");
  });
});

describe("runToolsmith", () => {
  it("returns the generated LocalTool and the injected runner's ToolResult", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(SIMPLE_TOOL) }] });
    const runLocalTool: RunLocalTool = (tool) =>
      Promise.resolve({ t: "tool_result", toolId: tool.id, ok: true, data: { count: 42 }, truncated: false });

    const outcome = await runToolsmith({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "stage-1",
      request: { userRequest: "how many files import X", dataDescription: "shape only" },
      worstCase: 2000,
      runLocalTool,
    });

    expect(outcome.tool).toEqual(SIMPLE_TOOL);
    expect(outcome.result.ok).toBe(true);
    expect(outcome.result.data).toEqual({ count: 42 });
  });

  it("spends only against the execution bucket, never another one", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(SIMPLE_TOOL) }] });
    await runToolsmith({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "stage-1",
      request: { userRequest: "x", dataDescription: "y" },
      worstCase: 2000,
      runLocalTool: (tool) =>
        Promise.resolve({ t: "tool_result", toolId: tool.id, ok: true, data: {}, truncated: false }),
    });
    expect(ledger.bucketSnapshot("execution").spent).toBeGreaterThan(0);
    expect(ledger.bucketSnapshot("recon").spent).toBe(0);
    expect(ledger.bucketSnapshot("planning").spent).toBe(0);
  });

  it("a worstCase exceeding the execution bucket's remaining allocation is rejected before the provider is ever called", async () => {
    const ledger = new Ledger({ total: 1_000 }); // execution bucket = 580 (58%)
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(SIMPLE_TOOL) }] });
    await expect(
      runToolsmith({
        ledger,
        provider,
        model: "gemini-3.7-flash",
        stageId: "stage-1",
        request: { userRequest: "x", dataDescription: "y" },
        worstCase: 900,
        runLocalTool: (tool) =>
          Promise.resolve({ t: "tool_result", toolId: tool.id, ok: true, data: {}, truncated: false }),
      }),
    ).rejects.toThrow();
    expect(provider.calls.generate).toHaveLength(0);
  });

  it("throws a clear error instead of executing garbage when the response isn't a valid LocalTool", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: "not json at all" }] });
    let runLocalToolCalled = false;
    await expect(
      runToolsmith({
        ledger,
        provider,
        model: "gemini-3.7-flash",
        stageId: "stage-1",
        request: { userRequest: "x", dataDescription: "y" },
        worstCase: 2000,
        runLocalTool: (tool) => {
          runLocalToolCalled = true;
          return Promise.resolve({ t: "tool_result", toolId: tool.id, ok: true, data: {}, truncated: false });
        },
      }),
    ).rejects.toThrow(/LocalToolSchema|not valid JSON/);
    expect(runLocalToolCalled).toBe(false);
  });
});

describe("runToolsmith with a pre-built library tool (P7-T5)", () => {
  it("never calls the LLM at all, and never touches the execution bucket, when a libraryTool is supplied", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ao-toolsmith-library-"));
    const stagingRoot = mkdtempSync(join(tmpdir(), "ao-toolsmith-library-staging-"));
    try {
      writeFileSync(join(dir, "a.ts"), "export const a = 1;\n", "utf8");
      writeFileSync(join(dir, "b.ts"), "export const b = 2;\n", "utf8");
      const libraryTool = matchLibraryTool({ kind: "file-stats", params: { dir } });

      const ledger = new Ledger({ total: 1_000_000 });
      const provider = new MockLLMProvider({
        responses: [{ text: "if this were parsed, the test below would fail" }],
      });
      const sandbox = detectSandbox();

      const outcome = await runToolsmith({
        ledger,
        provider,
        model: "gemini-3.7-flash",
        stageId: "stage-lib",
        request: { userRequest: "how many files are here", dataDescription: "a small directory" },
        worstCase: 2000,
        libraryTool,
        runLocalTool: (tool) => runNodeTool({ tool, sandbox, stagingRoot }),
      });

      expect(outcome.tool.source).toBe("registry");
      expect(outcome.result.ok).toBe(true);
      expect((outcome.result.data as { fileCount: number }).fileCount).toBe(2);

      // The point of P7-T5: zero LLM calls, zero tokens spent, when a library match exists.
      expect(provider.calls.generate).toHaveLength(0);
      expect(ledger.bucketSnapshot("execution").spent).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(stagingRoot, { recursive: true, force: true });
    }
  });
});

/**
 * P7-T4's own done-criterion, verbatim from TASKS.md: "'כמה קבצים מייבאים
 * את X' נענה על 10K קבצים בפחות מ-5K טוקנים סה"כ" — a scenario test, not
 * hand-waved. Builds a real 10,000-file fixture on disk, drives
 * `runToolsmith` with a `MockLLMProvider` (TASKS.md's own top rule: zero
 * real LLM calls in unit tests) standing in for what a real model would
 * write, and actually executes the generated script through `@ao/tools`'s
 * real `Sandbox` (not a fake) against the real fixture — proving the R3
 * payoff (ARCHITECTURE.md §5.2): the LLM's context only ever holds the
 * prompt + a short script, never the corpus itself, while the counting
 * happens for free, locally.
 */
describe("P7-T4 scenario: quantitative question over a 10K-file corpus", () => {
  let corpusDir: string;
  const FILE_COUNT = 10_000;
  const IMPORTING_EVERY_NTH = 10; // exactly every 10th file imports the target module
  let expectedCount: number;

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "ao-toolsmith-corpus-"));
    expectedCount = 0;
    for (let i = 0; i < FILE_COUNT; i++) {
      const importsTarget = i % IMPORTING_EVERY_NTH === 0;
      if (importsTarget) expectedCount += 1;
      const body = importsTarget
        ? `const target = require("target-module");\nmodule.exports = { i: ${String(i)} };\n`
        : `module.exports = { i: ${String(i)} };\n`;
      writeFileSync(join(corpusDir, `file-${String(i)}.js`), body, "utf8");
    }
  }, 60_000);

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("answers 'how many files import target-module' correctly, spending under 5,000 tokens total", async () => {
    const generatedScript = [
      "const fs = require('fs');",
      "const path = require('path');",
      "const inputs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
      "const files = fs.readdirSync(inputs.dir);",
      "let count = 0;",
      "for (const f of files) {",
      "  const content = fs.readFileSync(path.join(inputs.dir, f), 'utf8');",
      "  if (content.includes('target-module')) count++;",
      "}",
      "console.log(JSON.stringify({ count }));",
    ].join("\n");

    const generatedTool: LocalTool = {
      id: "count-target-module-importers",
      runtime: "node",
      source: "inline",
      script: generatedScript,
      inputs: { dir: corpusDir },
      limits: { timeoutMs: 30_000, maxOutputBytes: 4096, memoryMb: 256, network: false },
      expectedOutput: "json",
    };

    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(generatedTool) }] });
    const sandbox = detectSandbox();
    const stagingRoot = mkdtempSync(join(tmpdir(), "ao-toolsmith-staging-"));

    try {
      const outcome = await runToolsmith({
        ledger,
        provider,
        model: "gemini-3.7-flash",
        stageId: "stage-quant",
        request: {
          userRequest: "כמה קבצים מייבאים את target-module?",
          // Schema only — a description of shape, never the 10,000 files' content.
          dataDescription: `תיקייה עם ${String(FILE_COUNT)} קבצי JavaScript. לכל קובץ ייתכן ומכיל require("target-module").`,
        },
        worstCase: 4000,
        runLocalTool: (tool) => runNodeTool({ tool, sandbox, stagingRoot }),
      });

      expect(outcome.result.ok).toBe(true);
      expect(outcome.result.data).toEqual({ count: expectedCount });
      expect(expectedCount).toBe(FILE_COUNT / IMPORTING_EVERY_NTH);

      const totalSpentTokens = ledger.bucketSnapshot("execution").spent;
      expect(totalSpentTokens).toBeGreaterThan(0);
      expect(totalSpentTokens).toBeLessThan(5000);
    } finally {
      rmSync(stagingRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
