import { buildAgentPrompt } from "@ao/core";
import { listAgentTypes, loadAgent, resolveOutputSchema } from "@ao/platform";
import type { AgentTier, ThinkingLevel } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { resolveAgentsDir } from "./agents-dir.js";

const agentsDir = resolveAgentsDir({ moduleUrl: import.meta.url });

/**
 * ARCHITECTURE.md §4's table, for the 6 types that are actually
 * file-registry-driven (P10-T3) — recon/planner/checkpoint/outliner/
 * toolsmith are deliberately excluded here; see this file's own bottom
 * describe block for why. Kept as a literal expectation (not derived from
 * the files under test) so a real edit to either the doc or an agent.json
 * that lets them drift apart fails this test — that's the whole point of a
 * contract test.
 */
const EXPECTED: Readonly<
  Record<string, { tier: AgentTier; thinkingLevel: ThinkingLevel; typicalMaxOutputTokens: number }>
> = {
  reader: { tier: "worker", thinkingLevel: "low", typicalMaxOutputTokens: 8000 },
  analyst: { tier: "worker", thinkingLevel: "medium", typicalMaxOutputTokens: 12000 },
  coder: { tier: "worker", thinkingLevel: "medium", typicalMaxOutputTokens: 16000 },
  writer: { tier: "worker", thinkingLevel: "medium", typicalMaxOutputTokens: 12000 },
  critic: { tier: "cheap", thinkingLevel: "low", typicalMaxOutputTokens: 4000 },
  synthesizer: { tier: "synth", thinkingLevel: "high", typicalMaxOutputTokens: 16000 },
};

describe("agent registry contract (P10-T3)", () => {
  it("registers exactly the 6 NDJSON worker types under agents/ — no more, no fewer", () => {
    expect(listAgentTypes(agentsDir)).toEqual(Object.keys(EXPECTED).sort());
  });

  describe.each(Object.entries(EXPECTED))("%s", (type, expected) => {
    it("loads and validates against AgentDefinitionSchema", () => {
      const { definition } = loadAgent(agentsDir, type);
      expect(definition.type).toBe(type);
      expect(definition.outputContract.format).toBe("ndjson");
    });

    it("matches ARCHITECTURE.md §4's tier/thinkingLevel/typical output cap", () => {
      const { definition } = loadAgent(agentsDir, type);
      expect(definition.tier).toBe(expected.tier);
      expect(definition.thinkingLevel).toBe(expected.thinkingLevel);
      expect(definition.outputContract.maxOutputTokens).toBe(expected.typicalMaxOutputTokens);
    });

    it("declares a non-empty, real requiredInputs and supportsFanout", () => {
      const { definition } = loadAgent(agentsDir, type);
      expect(definition.requiredInputs.length).toBeGreaterThan(0);
      expect(definition.supportsFanout.length).toBeGreaterThan(0);
    });

    it("resolves outputContract.schemaRef to a real live schema", () => {
      const { definition } = loadAgent(agentsDir, type);
      expect(() => resolveOutputSchema(definition.outputContract.schemaRef)).not.toThrow();
    });

    it("renders through the real buildAgentPrompt with no leftover placeholders and a real {{outputSpec}}", () => {
      const { definition, promptTemplate } = loadAgent(agentsDir, type);
      const outputSchema = resolveOutputSchema(definition.outputContract.schemaRef);
      const rendered = buildAgentPrompt(promptTemplate, {
        objective: "בדיקת חוזה — מטרת דוגמה",
        shard: "בדיקת חוזה — פלח דוגמה",
        contract: "בדיקת חוזה — חוזה דוגמה",
        evidence: "בדיקת חוזה — עדות דוגמה",
        successCriteria: ["קריטריון לדוגמה"],
        outputSchema,
      });
      expect(rendered).not.toMatch(/\{\{\w+\}\}/);
      expect(rendered).toContain('"finding"');
      expect(rendered).toContain('"done"');
    });
  });
});

describe("recon/planner/checkpoint/outliner/toolsmith are NOT in the file registry (documented gap, not an oversight)", () => {
  it("have no folder under agents/ — their real prompts are hardcoded in packages/core, not agent.md templates", () => {
    const types = listAgentTypes(agentsDir);
    for (const excluded of ["recon", "planner", "checkpoint", "outliner", "toolsmith"]) {
      expect(types).not.toContain(excluded);
    }
  });
});
