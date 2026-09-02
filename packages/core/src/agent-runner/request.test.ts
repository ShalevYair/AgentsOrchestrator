import type { AgentDefinition } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { buildAgentRequest, parseAgentDefinition } from "./request.js";

function rawDefinition(): unknown {
  return {
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
}

describe("parseAgentDefinition", () => {
  it("accepts a well-formed agent.json payload", () => {
    const definition = parseAgentDefinition(rawDefinition());
    expect(definition.type).toBe("reader");
    expect(definition.tier).toBe("worker");
  });

  it("rejects a malformed payload instead of returning something partial", () => {
    expect(() => parseAgentDefinition({ type: "reader" })).toThrow();
  });
});

describe("buildAgentRequest", () => {
  const definition: AgentDefinition = parseAgentDefinition(rawDefinition());

  it("carries the agent's own thinking level, output cap, and temperature through", () => {
    const request = buildAgentRequest(definition, "the filled prompt", { model: "gemini-3.7-flash" });
    expect(request.model).toBe("gemini-3.7-flash");
    expect(request.thinkingLevel).toBe("medium");
    expect(request.maxOutputTokens).toBe(8000);
    expect(request.temperature).toBe(0.2);
    expect(request.contents).toEqual([{ role: "user", parts: [{ text: "the filled prompt" }] }]);
  });

  it("never sets responseSchema — worker agents stream NDJSON, not a single structured object", () => {
    const request = buildAgentRequest(definition, "x", { model: "gemini-3.7-flash" });
    expect(request.responseSchema).toBeUndefined();
  });

  it("passes through an optional cachedContentRef and systemInstruction when supplied", () => {
    const request = buildAgentRequest(definition, "x", {
      model: "gemini-3.7-flash",
      cachedContentRef: "mock-cache-1",
      systemInstruction: "you are a careful reader",
    });
    expect(request.cachedContentRef).toBe("mock-cache-1");
    expect(request.systemInstruction).toBe("you are a careful reader");
  });

  it("omits cachedContentRef/systemInstruction entirely when not supplied", () => {
    const request = buildAgentRequest(definition, "x", { model: "gemini-3.7-flash" });
    expect("cachedContentRef" in request).toBe(false);
    expect("systemInstruction" in request).toBe(false);
  });
});
