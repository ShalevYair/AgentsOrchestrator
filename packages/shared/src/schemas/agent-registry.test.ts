import { describe, expect, it } from "vitest";
import { AgentDefinitionSchema, type AgentDefinition } from "./agent-registry.js";

/** Verbatim from PROTOCOLS.md §10. */
const EXAMPLE_AGENT: AgentDefinition = {
  type: "reader",
  displayName: "קורא",
  tier: "worker",
  thinkingLevel: "medium",
  outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
  contextBudget: { default: 30000, max: 60000 },
  supportsFanout: ["shard", "ensemble"],
  requiredInputs: ["artifacts"],
  promptFile: "agent.md",
  temperature: 0.2,
};

describe("AgentDefinitionSchema", () => {
  it("parses the example from PROTOCOLS.md §10 verbatim", () => {
    const def = AgentDefinitionSchema.parse(EXAMPLE_AGENT);
    expect(def.supportsFanout).toEqual(["shard", "ensemble"]);
  });

  it("rejects a tier outside cheap/worker/synth", () => {
    expect(() => AgentDefinitionSchema.parse({ ...EXAMPLE_AGENT, tier: "premium" })).toThrow();
  });

  it("rejects an outputContract.format other than ndjson", () => {
    const bad = { ...EXAMPLE_AGENT, outputContract: { ...EXAMPLE_AGENT.outputContract, format: "json" } };
    expect(() => AgentDefinitionSchema.parse(bad as unknown)).toThrow();
  });

  it("does not confuse AgentContextBudget with Stage.contextBudget's shape", () => {
    // Stage.contextBudget uses maxInputTokens/cacheContract, not default/max —
    // that shape must NOT satisfy AgentDefinition.contextBudget.
    const wrongShape = { ...EXAMPLE_AGENT, contextBudget: { maxInputTokens: 30000, cacheContract: true } };
    expect(() => AgentDefinitionSchema.parse(wrongShape as unknown)).toThrow();
  });
});
