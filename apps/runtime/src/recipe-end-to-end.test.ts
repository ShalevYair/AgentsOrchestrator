import { createHash } from "node:crypto";
import {
  buildAgentPrompt,
  buildAgentRequest,
  collectGenerate,
  Ledger,
  parseNdjson,
  planWithRecipe,
  runScheduler,
  validatePlan,
  type NdjsonParseResult,
  type PlanValidationContext,
  type ScheduledTask,
  type TaskRunResult,
} from "@ao/core";
import { listRecipeNames, loadAgent, loadRecipe, resolveOutputSchema } from "@ao/platform";
import { MockLLMProvider } from "@ao/providers";
import type { Recipe, TaskUnderstanding } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { resolveAgentsDir } from "./agents-dir.js";
import { resolveRecipesDir } from "./recipes-dir.js";

const agentsDir = resolveAgentsDir({ moduleUrl: import.meta.url });
const recipesDir = resolveRecipesDir({ moduleUrl: import.meta.url });

/**
 * Read once, eagerly, at module load — same "genuinely dynamic, not a
 * hardcoded snapshot" design as `agent-contract.test.ts`'s `REGISTERED_TYPES`
 * (P10-T7 caught the same gap here: a hardcoded name list would silently
 * skip a new recipe added per docs/EXTENDING.md §2 instead of exercising it).
 * A new recipe that only uses agent types already covered by
 * `RESPONSES_BY_AGENT_TYPE` below gets the full real end-to-end run with
 * zero edits to this file; one that introduces a new agent type combination
 * fails loudly with a clear "no canned response for agentType" error rather
 * than silently not being tested — see that constant's own comment.
 */
const RECIPE_NAMES = listRecipeNames(recipesDir);
/** The 5 recipes TASKS.md P10-T5 names explicitly — checked as a floor, not an exact match, so a new recipe doesn't need this file touched. */
const DOCUMENTED_RECIPE_NAMES = [
  "repo-analysis",
  "code-review",
  "document-from-sources",
  "migration",
  "data-extraction",
];

const SHARD_ITEMS = [
  { id: "f1", path: "src/a.ts" },
  { id: "f2", path: "src/b.ts" },
  { id: "f3", path: "src/c.ts" },
  { id: "f4", path: "src/d.ts" },
];

function findingLine(id: string): string {
  return JSON.stringify({
    t: "finding",
    id,
    claim: `ממצא ${id} לבדיקת קצה-לקצה`,
    tags: ["e2e"],
    evidence: [{ artifact: "a1", loc: "src/x.ts:1-5" }],
    confidence: 0.8,
  });
}
function noteLine(text: string): string {
  return JSON.stringify({ t: "note", text });
}
function sectionLine(id: string): string {
  return JSON.stringify({ t: "section", id, title: `סעיף ${id}`, body: "תוכן לדוגמה לבדיקת קצה-לקצה." });
}
function fileEnvelopeLines(id: string, path: string, content: string): string[] {
  const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
  return [
    JSON.stringify({ t: "file_begin", id, path, op: "create", encoding: "utf8" }),
    JSON.stringify({ t: "file_chunk", id, seq: 0, data: content }),
    JSON.stringify({ t: "file_end", id, sha256, lines: content.split("\n").length }),
  ];
}
function doneLine(): string {
  return JSON.stringify({
    t: "done",
    summary: "הושלם",
    selfCheck: { criteriaMet: ["c1"], unmet: [], confidence: 0.9 },
  });
}

/**
 * One canned, schema-valid NDJSON response per agent type — matches the
 * envelope kinds each real `agent.md` (P10-T3) actually instructs that
 * type to emit (reader/analyst/critic -> finding+note, writer -> section,
 * coder -> file_begin/chunk/end), always ending in `done` per PROTOCOLS.md
 * §3 rule 3. `synthesizer` has no entry — none of the current recipes use
 * it. A new recipe that does (or that otherwise introduces a new agentType
 * this map doesn't cover) fails loudly with a clear "no canned end-to-end
 * response for agentType" error rather than being silently skipped; add one
 * line here and it runs for real, same as every type already listed.
 */
const RESPONSES_BY_AGENT_TYPE: Readonly<Record<string, string>> = {
  reader: [findingLine("f1"), findingLine("f2"), doneLine()].join("\n"),
  analyst: [findingLine("a1"), noteLine("ניתוח לדוגמה"), doneLine()].join("\n"),
  writer: [sectionLine("sec-1"), doneLine()].join("\n"),
  critic: [findingLine("issue-1"), doneLine()].join("\n"),
  coder: [...fileEnvelopeLines("w1", "out/result.json", '{"ok":true}'), doneLine()].join("\n"),
};

function understandingFor(recipeName: string): TaskUnderstanding {
  return {
    intent: "analyze",
    deliverableShape: { kind: "markdown", estimatedSize: "medium", structure: "sectioned" },
    evidenceNeeds: [],
    acceptanceCriteria: ["בדיקת קצה לקצה"],
    ambiguities: [],
    suggestedRecipe: recipeName,
    riskFlags: [],
  };
}

/**
 * The full real chain for one recipe: recon's suggestion (`understanding.
 * suggestedRecipe`) selected by `planWithRecipe` (P10-T4, zero LLM calls
 * when it matches) -> the real `validatePlan` (P5-T1) -> the real
 * `runScheduler` (P5-T4) executing every stage's real fan-out, where each
 * Task loads its real `agent.md` (P10-T3, via `@ao/platform`'s `loadAgent`)
 * and runs it through the real `buildAgentPrompt`/`buildAgentRequest`/
 * `collectGenerate`/`parseNdjson` chain against a `MockLLMProvider`. This
 * is what TASKS.md P10-T5's "5 מתכונים עובדים מקצה לקצה" actually means
 * here — not "the YAML parses," but "the whole real pipeline runs it."
 */
async function runRecipeEndToEnd(recipeName: string): Promise<{
  recipe: Recipe;
  source: "recipe" | "planner";
  schedulerResult: Awaited<ReturnType<typeof runScheduler<NdjsonParseResult>>>;
  plannerProvider: MockLLMProvider;
}> {
  const recipe = loadRecipe(recipesDir, recipeName);
  const budgetTotal = 1_000_000;
  const knownAgentTypes = new Set(["reader", "analyst", "coder", "writer", "critic", "synthesizer"]);
  const validationContext: PlanValidationContext = {
    budgetTotal,
    budgetLevel: "standard",
    knownAgentTypes,
    modelMaxOutputTokens: 64_000,
  };

  const planningLedger = new Ledger({ total: budgetTotal });
  // Deliberately empty — if planWithRecipe ever falls back to the real LLM
  // planner for one of these 5 recipes, MockLLMProvider's default response
  // ("mock response", not JSON) fails runPlanner's own parse/repair loop
  // and throws PlanInvalidError, failing the test loudly instead of
  // silently masking a broken recipe with an LLM-generated plan. The
  // `source`/`plannerProvider.calls.generate` assertions below are the
  // primary check; this is defense-in-depth for the same property.
  const plannerProvider = new MockLLMProvider({ responses: [] });

  const { plan, source } = await planWithRecipe({
    ledger: planningLedger,
    provider: plannerProvider,
    model: "gemini-3.7-flash",
    stageId: "planning",
    understanding: understandingFor(recipeName),
    inventory: "src/ (4 files, TS) — synthetic end-to-end fixture",
    validationContext,
    worstCasePerAttempt: 5000,
    recipeRegistry: { [recipeName]: recipe },
    runId: "run_e2etest",
    userRequest: `בדיקת קצה לקצה עבור המתכון ${recipeName}`,
  });

  const validation = validatePlan(plan, validationContext);
  expect(validation.issues).toEqual([]);
  expect(validation.valid).toBe(true);

  const executionLedger = new Ledger({ total: budgetTotal });
  const stageById = new Map(plan.stages.map((s) => [s.id, s]));

  const runTask = async (task: ScheduledTask): Promise<TaskRunResult<NdjsonParseResult>> => {
    const { definition, promptTemplate } = loadAgent(agentsDir, task.agentType);
    const outputSchema = resolveOutputSchema(definition.outputContract.schemaRef);
    const stage = stageById.get(task.stageId)!;
    const prompt = buildAgentPrompt(promptTemplate, {
      objective: plan.objective,
      shard: task.shard ? JSON.stringify(task.shard.items.map((i) => i.path ?? i.id)) : "(ריצה יחידה)",
      contract: stage.goal,
      evidence: "עדות לדוגמה לבדיקת קצה לקצה",
      successCriteria: stage.successCriteria,
      outputSchema,
    });
    const request = buildAgentRequest(definition, prompt, { model: "gemini-3.7-flash" });
    const cannedText = RESPONSES_BY_AGENT_TYPE[task.agentType];
    if (!cannedText) throw new Error(`no canned end-to-end response for agentType "${task.agentType}"`);
    const taskProvider = new MockLLMProvider({ responses: [{ text: cannedText }] });
    const collected = await collectGenerate(taskProvider, request);
    const parsed = parseNdjson(collected.text);
    return { usage: collected.usage, modelId: request.model, value: parsed };
  };

  const schedulerResult = await runScheduler<NdjsonParseResult>({
    ledger: executionLedger,
    plan,
    runTask,
    estimateWorstCase: (task) => {
      const stage = stageById.get(task.stageId)!;
      return Math.max(1, Math.ceil(stage.tokenBudget.hardCap / stage.fanout.count));
    },
    buildShardItems: () => SHARD_ITEMS,
  });

  return { recipe, source, schedulerResult, plannerProvider };
}

describe("recipe library (P10-T5)", () => {
  it("registers at least the 5 documented recipes under recipes/", () => {
    expect(RECIPE_NAMES).toEqual(expect.arrayContaining(DOCUMENTED_RECIPE_NAMES));
  });

  describe.each(RECIPE_NAMES)("%s", (recipeName) => {
    it("selects the recipe with zero LLM planning calls, then actually executes it through the real scheduler with no failed/budget-rejected tasks", async () => {
      const { source, schedulerResult, plannerProvider } = await runRecipeEndToEnd(recipeName);

      expect(source).toBe("recipe");
      expect(plannerProvider.calls.generate).toHaveLength(0);
      expect(schedulerResult.cancelled).toBe(false);

      const allOutcomes = schedulerResult.stages.flatMap((s) => s.outcomes);
      expect(allOutcomes.length).toBeGreaterThan(0);
      for (const outcome of allOutcomes) {
        expect(outcome.status).toBe("success");
        expect(outcome.value?.schemaViolations).toBe(0);
        expect(outcome.value?.done).toBe(true);
      }
    });
  });
});
