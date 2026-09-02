import { MockLLMProvider, type MockGenerateResponse } from "@ao/providers";
import {
  NdjsonEnvelopeSchema,
  type AgentDefinition,
  type Finding,
  type GenerateRequest,
  type Gap,
  type Plan,
  type TaskUnderstanding,
} from "@ao/shared";
import { describe, expect, it } from "vitest";
import { buildAgentPrompt, buildAgentRequest } from "../agent-runner/index.js";
import { Blackboard } from "../blackboard/index.js";
import { collectGenerate } from "../continuation/index.js";
import { applyStageFailurePolicy, assembleRunOutcome } from "../failure-policy/index.js";
import { Ledger } from "../ledger/index.js";
import { parseNdjson } from "../parse/index.js";
import { runPlanner } from "../planner/index.js";
import { validatePlan, type PlanValidationContext } from "../plan/index.js";
import { concatOrdered, dedupeFindings, type SectionResult, type TaskResult } from "../reducers/index.js";
import { runRecon } from "../recon/index.js";
import type { RunTaskFn, ScheduledTask } from "../scheduler/index.js";
import { runScheduler } from "../scheduler/index.js";

/**
 * P5's own integration test for the M2 milestone demo (TASKS.md's P5
 * section): "נתח את המאגר וכתוב מסמך ארכיטקטורה" — 4 stages, 14 agents,
 * parallel fan-out, local merge, within budget. Building the literal demo
 * folder is out of scope here (that's a real run against `@ao/ingest`,
 * not a unit test); what this proves is that every piece P5 built —
 * Plan validation (T1), recon (T2), planner (T3), the Scheduler (T4),
 * sharding (T5), the agent runner (T6), the NDJSON parser (T7), the
 * Blackboard (T9), Reducers (T10), and failure policy (T11) — composes
 * into one coherent run against `MockLLMProvider`, never a hand-waved
 * "and then it works." Continuation (T8) already has its own thorough
 * admission-integration coverage in `continuation.test.ts`; forcing a
 * truncation into this already-large 17-call scenario would add index-
 * bookkeeping fragility for no new proof, so it's intentionally not
 * re-exercised here.
 */

const AGENT_TYPES = ["reader", "analyst", "writer", "synthesizer"] as const;

function agentDefinition(type: (typeof AGENT_TYPES)[number], maxOutputTokens: number): AgentDefinition {
  return {
    type,
    displayName: type,
    tier: "worker",
    thinkingLevel: "medium",
    outputContract: { schemaRef: "NdjsonEnvelope", format: "ndjson", maxOutputTokens },
    contextBudget: { default: 20_000, max: 40_000 },
    supportsFanout: ["shard", "single"],
    requiredInputs: ["artifacts"],
    promptFile: "agent.md",
    temperature: 0.2,
  };
}

const AGENT_TEMPLATE = [
  "Objective: {{objective}}",
  "Shard: {{shard}}",
  "Contract: {{contract}}",
  "Evidence: {{evidence}}",
  "Success criteria:\n{{successCriteria}}",
  "Output shape:\n{{outputSpec}}",
].join("\n\n");

function findingLine(id: string, claim: string): string {
  return (
    JSON.stringify({
      t: "finding",
      id,
      claim,
      tags: ["structure"],
      evidence: [{ artifact: "a1", loc: "src/x.ts:1-10" }],
      confidence: 0.8,
    }) + "\n"
  );
}

function sectionLine(id: string, title: string, body: string): string {
  return JSON.stringify({ t: "section", id, title, body }) + "\n";
}

const DONE_LINE =
  JSON.stringify({
    t: "done",
    summary: "ok",
    selfCheck: { criteriaMet: ["c1"], unmet: [], confidence: 0.9 },
  }) + "\n";

function buildPlan(): Plan {
  return {
    version: 1,
    runId: "run_m2demo",
    objective: "analyze the repo and write an architecture document",
    deliverables: [{ id: "d1", kind: "markdown", target: "chat", acceptance: ["covers all core packages"] }],
    readPolicy: { maxRung: "R2", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages: [
      {
        id: "s1",
        name: "map structure",
        goal: "identify modules and boundaries",
        dependsOn: [],
        agentType: "reader",
        fanout: { mode: "shard", count: 6, maxParallel: 3, shardKey: "module" },
        inputs: [{ from: "artifacts", select: "repoMap" }],
        outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
        contextBudget: { maxInputTokens: 30_000, cacheContract: true },
        tokenBudget: { estimatedIn: 90_000, estimatedOut: 24_000, hardCap: 300_000 },
        mergeStrategy: "local:dedupe-findings",
        successCriteria: ["at least one finding per module"],
        onFailure: "degrade",
        optional: false,
      },
      {
        id: "s2",
        name: "focused analysis",
        goal: "derive higher-level analysis from structural findings",
        dependsOn: ["s1"],
        agentType: "analyst",
        fanout: { mode: "shard", count: 4, maxParallel: 2, shardKey: "module" },
        inputs: [{ from: "s1", select: "findings" }],
        outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
        contextBudget: { maxInputTokens: 30_000, cacheContract: true },
        tokenBudget: { estimatedIn: 90_000, estimatedOut: 24_000, hardCap: 300_000 },
        mergeStrategy: "local:dedupe-findings",
        successCriteria: ["at least one analytical finding"],
        onFailure: "degrade",
        optional: false,
      },
      {
        id: "s3",
        name: "write sections",
        goal: "write the architecture document's sections",
        dependsOn: ["s2"],
        agentType: "writer",
        fanout: { mode: "shard", count: 3, maxParallel: 2, shardKey: "section" },
        inputs: [{ from: "s2", select: "findings" }],
        outputContract: { schemaRef: "Section", format: "ndjson", maxOutputTokens: 12_000 },
        contextBudget: { maxInputTokens: 30_000, cacheContract: true },
        tokenBudget: { estimatedIn: 60_000, estimatedOut: 36_000, hardCap: 300_000 },
        mergeStrategy: "local:concat-ordered",
        successCriteria: ["every section has a body"],
        onFailure: "degrade",
        optional: false,
      },
      {
        id: "s4",
        name: "synthesize",
        goal: "produce the final assembled document",
        dependsOn: ["s3"],
        agentType: "synthesizer",
        fanout: { mode: "single", count: 1, maxParallel: 1 },
        inputs: [{ from: "s3", select: "sections" }],
        outputContract: { schemaRef: "Section", format: "ndjson", maxOutputTokens: 16_000 },
        contextBudget: { maxInputTokens: 30_000, cacheContract: true },
        tokenBudget: { estimatedIn: 40_000, estimatedOut: 16_000, hardCap: 300_000 },
        mergeStrategy: "local:concat-ordered",
        successCriteria: ["document has a summary section"],
        onFailure: "degrade",
        optional: false,
      },
    ],
    reserve: { synthesisTokens: 200_000, repairTokens: 200_000 },
  };
}

describe("M2 integration — analyze-the-repo, 4 stages / 14 tasks, within budget", () => {
  it("composes recon -> planner -> scheduler -> agent runner -> parser -> blackboard -> reducers -> failure policy end to end", async () => {
    const BUDGET_TOTAL = 2_500_000; // BUDGET.md §1's "standard" level
    const ledger = new Ledger({ total: BUDGET_TOTAL });

    const understanding: TaskUnderstanding = {
      intent: "analyze",
      deliverableShape: { kind: "markdown", estimatedSize: "large", structure: "sectioned" },
      evidenceNeeds: [{ what: "repo structure", rung: "R1", why: "needed to map boundaries" }],
      acceptanceCriteria: ["covers all core packages"],
      ambiguities: [],
      suggestedRecipe: "repo-analysis",
      riskFlags: [],
    };
    const plan = buildPlan();

    // Call order is deterministic: runPool claims the next index
    // synchronously before any await, so dispatch order always matches
    // task array order even under concurrency (P5-T4's own pool.ts
    // property) — recon, then planner, then every task's single call, in
    // the Scheduler's topological/fan-out order.
    const responses: MockGenerateResponse[] = [
      { text: JSON.stringify(understanding) }, // recon
      { text: JSON.stringify(plan) }, // planner
      ...Array.from({ length: 6 }, (_, i) =>
        i < 2
          ? findingLine(`f-s1-${String(i)}`, "the auth module validates JWT tokens on every request")
          : findingLine(`f-s1-${String(i)}`, `module ${String(i)} owns its own distinct concern`),
      ).map((text, i) => ({ text: text + DONE_LINE, chunkCount: (i % 3) + 1 })),
      ...Array.from({ length: 4 }, (_, i) => ({
        text: findingLine(`f-s2-${String(i)}`, `analytical insight number ${String(i)}`) + DONE_LINE,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        text:
          sectionLine(`sec-${String(i)}`, `Section ${String(i)}`, `Body text for section ${String(i)}.`) +
          DONE_LINE,
      })),
      { text: sectionLine("sec-final", "Summary", "This document summarizes the architecture.") + DONE_LINE },
    ];

    const provider = new MockLLMProvider({ responses });

    const reconResult = await runRecon({
      ledger,
      provider,
      model: "gemini-flash-lite-latest",
      stageId: "recon",
      request: {
        userRequest: plan.objective,
        inventory: "packages/{core,shared,ingest,providers,platform} (TS)",
      },
      worstCase: 5_000,
    });
    expect(reconResult).toEqual(understanding);

    const knownAgentTypes = new Set<string>(AGENT_TYPES);
    const validationContext: PlanValidationContext = {
      budgetTotal: BUDGET_TOTAL,
      budgetLevel: "standard",
      knownAgentTypes,
      modelMaxOutputTokens: 64_000,
    };

    const plannerResult = await runPlanner({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "planning",
      understanding: reconResult,
      inventory: "packages/{core,shared,ingest,providers,platform} (TS)",
      validationContext,
      worstCasePerAttempt: 10_000,
    });
    expect(plannerResult.attempts).toHaveLength(0); // validates clean on the first attempt
    expect(plannerResult.plan.stages).toHaveLength(4);
    const totalTasks = plannerResult.plan.stages.reduce((sum, s) => sum + s.fanout.count, 0);
    expect(totalTasks).toBe(14); // the M2 demo's own numbers: 4 stages, 14 agents

    // A second, independent validation pass — proving V1-V8 accept the
    // planner's own output, not just that runPlanner trusts itself.
    const revalidated = validatePlan(plannerResult.plan, validationContext);
    expect(revalidated.valid).toBe(true);

    const board = new Blackboard();
    type TaskValue =
      { kind: "findings"; findings: Finding[] } | { kind: "sections"; sections: SectionResult[] };

    const runTask: RunTaskFn<TaskValue> = async (task: ScheduledTask) => {
      const definition = agentDefinition(task.agentType as (typeof AGENT_TYPES)[number], 16_000);
      const shardDescription = task.shard ? task.shard.items.map((i) => i.id).join(", ") : "(full input)";
      const prompt = buildAgentPrompt(AGENT_TEMPLATE, {
        objective: plan.objective,
        shard: shardDescription,
        contract: "shared contract block",
        evidence: "retrieved evidence",
        successCriteria: ["produces valid NDJSON"],
        outputSchema: NdjsonEnvelopeSchema,
      });
      const request: GenerateRequest = buildAgentRequest(definition, prompt, { model: "gemini-3.7-flash" });
      const collected = await collectGenerate(provider, request);
      const parsed = parseNdjson(collected.text);
      expect(parsed.schemaViolations).toBe(0);
      expect(parsed.done).toBe(true);

      if (task.agentType === "reader" || task.agentType === "analyst") {
        const findings: Finding[] = parsed.envelopes
          .filter((e): e is Extract<typeof e, { t: "finding" }> => e.t === "finding")
          .map((e) => ({
            id: e.id,
            stageId: task.stageId,
            claim: e.claim,
            tags: e.tags,
            evidence: e.evidence,
            confidence: e.confidence,
          }));
        for (const finding of findings) board.addFinding(finding);
        return { usage: collected.usage, modelId: request.model, value: { kind: "findings", findings } };
      }

      const sections: SectionResult[] = parsed.envelopes
        .filter((e): e is Extract<typeof e, { t: "section" }> => e.t === "section")
        .map((e) => ({ id: e.id, title: e.title, body: e.body }));
      return { usage: collected.usage, modelId: request.model, value: { kind: "sections", sections } };
    };

    const schedulerResult = await runScheduler({
      ledger,
      plan: plannerResult.plan,
      runTask,
      estimateWorstCase: () => 6_000,
      buildShardItems: (stage) =>
        Array.from({ length: stage.fanout.count }, (_, i) => ({ id: `${stage.id}-item-${String(i)}` })),
    });

    expect(schedulerResult.cancelled).toBe(false);
    expect(schedulerResult.stages).toHaveLength(4);

    const allGaps: Gap[] = [];
    let finalMarkdown = "";

    for (const stageResult of schedulerResult.stages) {
      const stageDef = plannerResult.plan.stages.find((s) => s.id === stageResult.stageId);
      expect(stageDef).toBeDefined();
      if (!stageDef) continue;

      const decision = applyStageFailurePolicy(stageDef, stageResult);
      expect(decision.decision).toBe("proceed"); // nothing failed in this scripted run
      if (decision.decision !== "proceed") continue;

      if (stageDef.mergeStrategy === "local:dedupe-findings") {
        const inputs: TaskResult<Finding[]>[] = decision.outcomes.map((o) => ({
          taskId: o.taskId,
          value: o.value?.kind === "findings" ? o.value.findings : [],
        }));
        const reduced = dedupeFindings(inputs, { stageId: stageDef.id });
        allGaps.push(...reduced.gaps);
      } else {
        const inputs: TaskResult<SectionResult[]>[] = decision.outcomes.map((o) => ({
          taskId: o.taskId,
          value: o.value?.kind === "sections" ? o.value.sections : [],
        }));
        const reduced = concatOrdered(inputs, { stageId: stageDef.id });
        allGaps.push(...reduced.gaps);
        if (stageDef.id === "s4") finalMarkdown = reduced.value;
      }
    }

    // The reader stage (s1) deliberately included two near-duplicate
    // claims — proving the Blackboard actually deduped them on write
    // (P5-T9), independent of the reducer's own dedup pass over the same
    // raw stage output (P5-T10) — both layers exist and both engage here.
    const boardSnapshot = board.snapshot();
    const s1Findings = boardSnapshot.findings.filter((f) => f.stageId === "s1");
    expect(s1Findings).toHaveLength(5); // 6 raw findings, 2 of which merged into 1

    const outcome = assembleRunOutcome(finalMarkdown, allGaps);
    expect(outcome.status).toBe("success"); // nothing failed, nothing to gap
    expect(outcome.deliverable).toContain("This document summarizes the architecture.");

    // Within budget, and nothing leaked.
    expect(ledger.available).toBeGreaterThan(0);
    expect(ledger.spent).toBeLessThan(BUDGET_TOTAL);
    expect(ledger.openReservationCount).toBe(0);
  });
});
