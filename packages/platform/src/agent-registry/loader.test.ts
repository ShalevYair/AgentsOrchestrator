import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@ao/shared";
import { listAgentTypes, loadAgent, loadAgentDefinition, loadAgentPromptTemplate } from "./loader.js";

let dir: string;

function writeAgent(
  type: string,
  overrides: Record<string, unknown> = {},
  promptContent = "Objective: {{objective}}",
): void {
  const agentDir = join(dir, type);
  mkdirSync(agentDir, { recursive: true });
  const definition = {
    type,
    displayName: type,
    tier: "worker",
    thinkingLevel: "medium",
    outputContract: { schemaRef: "NdjsonEnvelope", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { default: 20_000, max: 40_000 },
    supportsFanout: ["shard", "single"],
    requiredInputs: ["artifacts"],
    promptFile: "agent.md",
    temperature: 0.2,
    ...overrides,
  };
  writeFileSync(join(agentDir, "agent.json"), JSON.stringify(definition));
  writeFileSync(join(agentDir, "agent.md"), promptContent);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-agent-registry-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("listAgentTypes", () => {
  it("throws NotFoundError when the agents directory itself is missing", () => {
    const missing = join(dir, "does-not-exist");
    expect(() => listAgentTypes(missing)).toThrow(/agents directory not found/);
    try {
      listAgentTypes(missing);
      expect.unreachable();
    } catch (error) {
      expect(isAppError(error) && error.code).toBe("NOT_FOUND");
    }
  });

  it("returns an empty list for an existing but empty directory", () => {
    expect(listAgentTypes(dir)).toEqual([]);
  });

  it("finds every subdirectory that holds an agent.json, sorted, and ignores the rest", () => {
    writeAgent("writer");
    writeAgent("reader");
    mkdirSync(join(dir, "no-definition-here"));
    writeFileSync(join(dir, "stray-file.txt"), "not a directory");

    expect(listAgentTypes(dir)).toEqual(["reader", "writer"]);
  });

  it("picks up a brand-new folder with zero code changes — just another call", () => {
    writeAgent("writer");
    expect(listAgentTypes(dir)).toEqual(["writer"]);

    writeAgent("critic");
    expect(listAgentTypes(dir)).toEqual(["critic", "writer"]);
  });
});

describe("loadAgentDefinition", () => {
  it("throws NotFoundError for an unregistered type", () => {
    expect(() => loadAgentDefinition(dir, "ghost")).toThrow(/unknown agent type "ghost"/);
  });

  it("throws ConfigError when agent.json is not valid JSON", () => {
    mkdirSync(join(dir, "broken"));
    writeFileSync(join(dir, "broken", "agent.json"), "{ not json");
    expect(() => loadAgentDefinition(dir, "broken")).toThrow(/not valid JSON/);
  });

  it("throws ConfigError when agent.json fails AgentDefinitionSchema", () => {
    mkdirSync(join(dir, "invalid"));
    writeFileSync(join(dir, "invalid", "agent.json"), JSON.stringify({ type: "invalid" }));
    expect(() => loadAgentDefinition(dir, "invalid")).toThrow(/does not match AgentDefinitionSchema/);
  });

  it("throws ConfigError when the type field doesn't match the folder name", () => {
    writeAgent("reader", { type: "writer" });
    expect(() => loadAgentDefinition(dir, "reader")).toThrow(/does not match its folder name/);
  });

  it("returns a fully parsed, validated AgentDefinition for a real file", () => {
    writeAgent("reader", { displayName: "קורא", temperature: 0.3 });
    const definition = loadAgentDefinition(dir, "reader");
    expect(definition.type).toBe("reader");
    expect(definition.displayName).toBe("קורא");
    expect(definition.temperature).toBe(0.3);
    expect(definition.outputContract.format).toBe("ndjson");
  });
});

describe("loadAgentPromptTemplate", () => {
  it("throws NotFoundError when the declared promptFile is missing", () => {
    mkdirSync(join(dir, "reader"));
    writeFileSync(
      join(dir, "reader", "agent.json"),
      JSON.stringify({
        type: "reader",
        displayName: "reader",
        tier: "worker",
        thinkingLevel: "medium",
        outputContract: { schemaRef: "NdjsonEnvelope", format: "ndjson", maxOutputTokens: 8000 },
        contextBudget: { default: 20_000, max: 40_000 },
        supportsFanout: ["single"],
        requiredInputs: ["artifacts"],
        promptFile: "agent.md",
        temperature: 0.2,
      }),
    );
    const definition = loadAgentDefinition(dir, "reader");
    expect(() => loadAgentPromptTemplate(dir, "reader", definition)).toThrow(
      /promptFile "agent.md" but it's missing/,
    );
  });

  it("reads the raw prompt text as-is", () => {
    writeAgent("reader", {}, "Objective: {{objective}}\nEvidence: {{evidence}}");
    const definition = loadAgentDefinition(dir, "reader");
    const prompt = loadAgentPromptTemplate(dir, "reader", definition);
    expect(prompt).toBe("Objective: {{objective}}\nEvidence: {{evidence}}");
  });

  it("honors a non-default promptFile name", () => {
    mkdirSync(join(dir, "reader"));
    writeFileSync(
      join(dir, "reader", "agent.json"),
      JSON.stringify({
        type: "reader",
        displayName: "reader",
        tier: "worker",
        thinkingLevel: "medium",
        outputContract: { schemaRef: "NdjsonEnvelope", format: "ndjson", maxOutputTokens: 8000 },
        contextBudget: { default: 20_000, max: 40_000 },
        supportsFanout: ["single"],
        requiredInputs: ["artifacts"],
        promptFile: "custom-prompt.md",
        temperature: 0.2,
      }),
    );
    writeFileSync(join(dir, "reader", "custom-prompt.md"), "custom content");
    const definition = loadAgentDefinition(dir, "reader");
    expect(loadAgentPromptTemplate(dir, "reader", definition)).toBe("custom content");
  });
});

describe("loadAgent", () => {
  it("combines the definition and prompt template in one call", () => {
    writeAgent("writer", {}, "write {{objective}}");
    const { definition, promptTemplate } = loadAgent(dir, "writer");
    expect(definition.type).toBe("writer");
    expect(promptTemplate).toBe("write {{objective}}");
  });
});

describe("hot reload (P10-T2) — editing agent.md/agent.json takes effect on the very next load, no restart", () => {
  it("picks up an edited prompt template on the next loadAgent call", () => {
    writeAgent("writer", {}, "version 1");
    expect(loadAgent(dir, "writer").promptTemplate).toBe("version 1");

    writeFileSync(join(dir, "writer", "agent.md"), "version 2");
    expect(loadAgent(dir, "writer").promptTemplate).toBe("version 2");
  });

  it("picks up an edited agent.json field on the next loadAgentDefinition call", () => {
    writeAgent("writer", { temperature: 0.1 });
    expect(loadAgentDefinition(dir, "writer").temperature).toBe(0.1);

    writeAgent("writer", { temperature: 0.9 });
    expect(loadAgentDefinition(dir, "writer").temperature).toBe(0.9);
  });
});
