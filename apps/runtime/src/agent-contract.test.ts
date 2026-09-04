import { buildAgentPrompt } from "@ao/core";
import { listAgentTypes, loadAgent, resolveOutputSchema } from "@ao/platform";
import type { AgentTier, ThinkingLevel } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { resolveAgentsDir } from "./agents-dir.js";

const agentsDir = resolveAgentsDir({ moduleUrl: import.meta.url });
/**
 * Read once, eagerly, at module load — this is what makes every describe.each
 * block below genuinely dynamic: a folder added under `agents/` (by anyone,
 * anytime, per docs/EXTENDING.md §1) picks up the full structural contract
 * check automatically, with zero edits to this file. Only the
 * ARCHITECTURE.md-drift check below needs this file touched, and only
 * because that check is inherently about a specific doc's specific claims —
 * see its own comment.
 */
const REGISTERED_TYPES = listAgentTypes(agentsDir);

/**
 * ARCHITECTURE.md §4's table, for the file-registry-driven types (P10-T3) —
 * recon/planner/checkpoint/outliner/toolsmith are deliberately excluded;
 * see this file's own bottom describe block for why. Kept as a literal
 * expectation (not derived from the files under test) so a real edit to
 * either the doc or an agent.json that lets them drift apart fails this
 * test — that's the whole point of a contract test. This is intentionally
 * *not* every registered type: a new type someone adds per EXTENDING.md §1
 * isn't in ARCHITECTURE.md §4 either, so there's nothing here to check it
 * against until someone documents it there too.
 */
const DOCUMENTED: Readonly<
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
  it("registers at least the 6 documented NDJSON worker types under agents/", () => {
    expect(REGISTERED_TYPES).toEqual(expect.arrayContaining(Object.keys(DOCUMENTED)));
  });

  describe.each(REGISTERED_TYPES)("%s", (type) => {
    it("loads and validates against AgentDefinitionSchema", () => {
      const { definition } = loadAgent(agentsDir, type);
      expect(definition.type).toBe(type);
      expect(definition.outputContract.format).toBe("ndjson");
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
    });
  });

  describe.each(Object.entries(DOCUMENTED))("%s (documented in ARCHITECTURE.md §4)", (type, expected) => {
    it("matches the tier/thinkingLevel/typical output cap the doc states", () => {
      const { definition } = loadAgent(agentsDir, type);
      expect(definition.tier).toBe(expected.tier);
      expect(definition.thinkingLevel).toBe(expected.thinkingLevel);
      expect(definition.outputContract.maxOutputTokens).toBe(expected.typicalMaxOutputTokens);
    });
  });
});

describe("recon/planner/checkpoint/outliner/toolsmith are NOT in the file registry (documented gap, not an oversight)", () => {
  it("have no folder under agents/ — their real prompts are hardcoded in packages/core, not agent.md templates", () => {
    for (const excluded of ["recon", "planner", "checkpoint", "outliner", "toolsmith"]) {
      expect(REGISTERED_TYPES).not.toContain(excluded);
    }
  });
});
