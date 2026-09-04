import {
  buildAgentPrompt,
  buildAgentRequest,
  buildTokenReport,
  collectGenerate,
  Ledger,
  planWithRecipe,
  runScheduler,
  runWithContinuation,
  validatePlan,
  type ContinuationOutcome,
  type NdjsonParseResult,
  type PlanValidationContext,
  type ScheduledTask,
  type TaskRunResult,
} from "@ao/core";
import { listAgentTypes, loadAgent, loadRecipe, resolveOutputSchema } from "@ao/platform";
import { MockLLMProvider, resolveModelEntry, WORKER_MODEL_ID } from "@ao/providers";
import type { EvalCase, TaskUnderstanding } from "@ao/shared";
import { buildCannedResponse, buildEvalShardItems, splitForContinuation } from "./canned-responses.js";

/**
 * P11-T3 — one Task's real output plus the continuation-protocol metadata
 * `@ao/core`'s `runWithContinuation` (PROTOCOLS.md §5) reports about how
 * it got there. `runScheduler`'s `T` is generic exactly so a caller can
 * inject this kind of richer per-Task value instead of the bare parse
 * result P11-T1/T2 used.
 */
export interface EvalTaskOutcomeValue {
  parsed: NdjsonParseResult;
  continuationAttempts: number;
  continuationOutcome: ContinuationOutcome;
  /** `Usage.cachedTokens` summed across the initial call plus every continuation attempt for this Task. */
  cacheHitTokens: number;
}

/** `inputScale: "large"` feeds far more shard items to `shard`-mode stages than a `"small"`/omitted case — enough to make `MockLLMProvider`'s length-based prompt-token estimate genuinely differ between the two, not just differ in label. */
const SHARD_ITEM_COUNT_BY_INPUT_SCALE: Record<"small" | "large", number> = { small: 4, large: 200 };

/**
 * `inputScale: "large"` also inflates the synthetic `evidence` prompt
 * variable every stage receives (not only `shard`-mode ones) — a real
 * large input means every downstream stage sees more upstream context,
 * not only the first reader stage. Repeat count for the filler text
 * below; `small`/omitted stays at T1's original single line.
 */
const EVIDENCE_REPEAT_BY_INPUT_SCALE: Record<"small" | "large", number> = { small: 1, large: 40 };

function buildSyntheticEvidence(inputScale: "small" | "large"): string {
  return "עדות סינתטית ל-eval. ".repeat(EVIDENCE_REPEAT_BY_INPUT_SCALE[inputScale]).trim();
}

/** `understanding.deliverableShape.estimatedSize` already covers the output-size axis (reused as-is, not duplicated) — this maps it to how many findings/sections the canned response repeats, or how many lines the canned file contains, so a "large"/"xlarge" case's run genuinely spends more output tokens than a "small" one's. */
function outputScaleFor(
  estimatedSize: EvalCase["understanding"]["deliverableShape"]["estimatedSize"],
): number {
  switch (estimatedSize) {
    case "small":
      return 1;
    case "medium":
      return 2;
    case "large":
      return 5;
    case "xlarge":
      return 9;
  }
}

export interface EvalCaseRunResult {
  id: string;
  description: string;
  tags: string[];
  pass: boolean;
  /** Every failed assertion — empty exactly when `pass` is true. A case can fail more than one at once (e.g. a stage both errors and blows a cost ceiling), so this is a list, not a single reason. */
  failures: string[];
  durationMs: number;
  /** `TokenReport.grandTotalSpent` — non-reserve spend plus whatever was drawn from reserve, the real total cost of this run's execution ledger (planning is free: `planWithRecipe`'s zero-LLM-call recipe path is exactly what's being asserted). */
  tokensSpent: number;
  costUsd: number;
  /** Summed across every task outcome's `NdjsonParseResult.schemaViolations`. */
  schemaViolations: number;
  /** Summed across every task's real `runWithContinuation` attempts (PROTOCOLS.md §5) — 0 for every case whose canned response fits in one call, which is every P11-T2 case except the two `estimatedSize: xlarge` ones this task wires to genuinely need it. */
  continuationAttempts: number;
  /** Summed `Usage.cachedTokens` across every real call this run made (initial + continuation) — honestly 0 today: no case's `MockLLMProvider` response ever sets `cachedTokens`, because no real caching layer (context cache / response cache) is wired into this harness yet. Reported as a real (currently-always-zero) measurement, not omitted, so a future case that does exercise caching shows up here without further plumbing. */
  cacheHitTokens: number;
  /** Sum of `doneEnvelope.selfCheck.criteriaMet.length` across every successful task — real self-reported data from the canned `done` envelope (PROTOCOLS.md §3), not a quality judgment (that's P11-T4's LLM judge). */
  criteriaMet: number;
  /** Sum of `doneEnvelope.selfCheck.unmet.length` across every successful task. */
  criteriaUnmet: number;
  planSource: "recipe" | "planner";
  cancelled: boolean;
}

export interface RunEvalCaseOptions {
  agentsDir: string;
  recipesDir: string;
  /** Defaults to `@ao/providers`' pinned `WORKER_MODEL_ID` — every golden task runs at the worker tier, same as a real Stage. */
  model?: string;
}

/**
 * `EvalCase.id` is free-form (kebab-case by convention, not enforced), but
 * `RunIdSchema` requires `run_[A-Za-z0-9]+` — no hyphens, no underscores
 * past the prefix (the exact bug P10-T5 hit and documented in TASKS.md).
 * Stripping non-alphanumerics keeps every case id usable without asking
 * fixture authors to hand-write a separate, schema-legal run id too.
 */
function toRunId(caseId: string): string {
  const sanitized = caseId.replace(/[^A-Za-z0-9]/g, "");
  return `run_eval${sanitized.length > 0 ? sanitized : "case"}`;
}

/**
 * TASKS.md P11-T1 — runs one golden-task fixture through the real
 * recipe -> plan -> scheduler pipeline, exactly the chain
 * `apps/runtime/src/recipe-end-to-end.test.ts` (P10-T5) proved for its 5
 * hardcoded per-recipe test bodies, generalized here to be driven by data
 * (`EvalCase`) instead. Every LLM call in this chain goes through
 * `MockLLMProvider` — deterministic and free, so this is safe to run as
 * often as `pnpm eval` is invoked, including in CI.
 */
export async function runEvalCase(
  evalCase: EvalCase,
  options: RunEvalCaseOptions,
): Promise<EvalCaseRunResult> {
  const model = options.model ?? WORKER_MODEL_ID;
  const modelMaxOutputTokens = resolveModelEntry(model)?.maxOutputTokens ?? 64_000;
  const knownAgentTypes = new Set(listAgentTypes(options.agentsDir));
  const failures: string[] = [];
  const startedAt = performance.now();
  const inputScale = evalCase.inputScale ?? "small";
  const shardItemCount = SHARD_ITEM_COUNT_BY_INPUT_SCALE[inputScale];
  const syntheticEvidence = buildSyntheticEvidence(inputScale);
  const outputScale = outputScaleFor(evalCase.understanding.deliverableShape.estimatedSize);

  const understanding: TaskUnderstanding = {
    ...evalCase.understanding,
    suggestedRecipe: evalCase.recipeName,
  };
  const validationContext: PlanValidationContext = {
    budgetTotal: evalCase.budgetTotal,
    budgetLevel: evalCase.budgetLevel,
    knownAgentTypes,
    modelMaxOutputTokens,
  };

  const recipe = loadRecipe(options.recipesDir, evalCase.recipeName);
  const planningLedger = new Ledger({ total: evalCase.budgetTotal });
  // Deliberately empty, same reasoning as recipe-end-to-end.test.ts: if
  // planWithRecipe ever falls back to the real LLM planner for a case that
  // should have matched its recipe, MockLLMProvider's default non-JSON
  // response fails runPlanner's parse/repair loop loudly instead of a
  // silent LLM-generated plan masking a broken fixture.
  const plannerProvider = new MockLLMProvider({ responses: [] });

  const { plan, source, recipeValidationIssues } = await planWithRecipe({
    ledger: planningLedger,
    provider: plannerProvider,
    model,
    stageId: "planning",
    understanding,
    inventory: `${evalCase.recipeName} — קלט סינתטי ל-eval (${evalCase.id})`,
    validationContext,
    worstCasePerAttempt: 5000,
    recipeRegistry: { [evalCase.recipeName]: recipe },
    runId: toRunId(evalCase.id),
    userRequest: evalCase.userRequest,
  });

  if (source !== "recipe") {
    const detail =
      recipeValidationIssues !== undefined
        ? ` (recipe validation issues: ${JSON.stringify(recipeValidationIssues)})`
        : " (recipe was never even matched by name)";
    failures.push(`expected the zero-LLM recipe path but fell back to the real planner${detail}`);
  }

  const validation = validatePlan(plan, validationContext);
  if (!validation.valid) {
    failures.push(`plan failed validatePlan: ${JSON.stringify(validation.issues)}`);
  }

  const executionLedger = new Ledger({
    total: evalCase.budgetTotal,
    pricing: (id) => resolveModelEntry(id)?.pricing,
  });
  const stageById = new Map(plan.stages.map((s) => [s.id, s]));

  // P11-T3 — xlarge-output cases genuinely need @ao/core's real
  // runWithContinuation (PROTOCOLS.md §5): the canned response is
  // deliberately split so the first call looks cut off by the output cap
  // (finishReason: "max_tokens", not done) and a second call finishes it,
  // exactly as a real model output that large would hit against
  // outputContract.maxOutputTokens. Every other case's canned response
  // always finishes "stop" already done, so runWithContinuation's own
  // "already-complete" fast path applies — zero behavior change for them.
  //
  // Gated on agentType, not just the case's estimatedSize: across all 5
  // recipes, only `writer` (sections) and `coder` (file content) ever
  // generate substantial new prose/content — `reader`/`analyst`/`critic`
  // stay comparatively short regardless of the deliverable's declared
  // size (a recon reader's per-file findings don't balloon just because
  // the final document will be huge; only the stage that actually
  // assembles that document does). Applying this to every stage
  // indiscriminately (an earlier version of this code did) would have
  // made every xlarge case's *reader* stage also "need" continuation —
  // not a real property of a large output, just an artifact of a coarser
  // condition.
  const xlargeOutput = evalCase.understanding.deliverableShape.estimatedSize === "xlarge";
  const CONTENT_PRODUCING_AGENT_TYPES = new Set(["writer", "coder"]);

  const runTask = async (task: ScheduledTask): Promise<TaskRunResult<EvalTaskOutcomeValue>> => {
    const { definition, promptTemplate } = loadAgent(options.agentsDir, task.agentType);
    const outputSchema = resolveOutputSchema(definition.outputContract.schemaRef);
    const stage = stageById.get(task.stageId);
    if (!stage) throw new Error(`scheduler produced a task for unknown stage "${task.stageId}"`);
    const prompt = buildAgentPrompt(promptTemplate, {
      objective: plan.objective,
      shard: task.shard ? JSON.stringify(task.shard.items.map((i) => i.path ?? i.id)) : "(ריצה יחידה)",
      contract: stage.goal,
      evidence: syntheticEvidence,
      successCriteria: stage.successCriteria,
      outputSchema,
    });
    const request = buildAgentRequest(definition, prompt, { model });
    const cannedText = buildCannedResponse(task.agentType, outputScale);
    if (!cannedText) throw new Error(`no canned eval response for agentType "${task.agentType}"`);
    const useContinuation = xlargeOutput && CONTENT_PRODUCING_AGENT_TYPES.has(task.agentType);

    const taskProvider = useContinuation
      ? (() => {
          const { initialText, continuationText } = splitForContinuation(cannedText);
          return new MockLLMProvider({
            responses: [
              { text: initialText, finishReason: "max_tokens" },
              { text: continuationText, finishReason: "stop" },
            ],
          });
        })()
      : new MockLLMProvider({ responses: [{ text: cannedText }] });

    const collected = await collectGenerate(taskProvider, request);
    const continuationResult = await runWithContinuation({
      ledger: executionLedger,
      provider: taskProvider,
      stageId: task.stageId,
      agentType: task.agentType,
      baseRequest: request,
      initialText: collected.text,
      initialFinishReason: collected.finishReason,
      worstCasePerContinuation: 5000,
    });
    const cacheHitTokens =
      collected.usage.cachedTokens +
      continuationResult.attempts.reduce((sum, attempt) => sum + attempt.usage.cachedTokens, 0);

    return {
      usage: collected.usage,
      modelId: request.model,
      value: {
        parsed: continuationResult.parsed,
        continuationAttempts: continuationResult.attempts.length,
        continuationOutcome: continuationResult.outcome,
        cacheHitTokens,
      },
    };
  };

  const schedulerResult = await runScheduler<EvalTaskOutcomeValue>({
    ledger: executionLedger,
    plan,
    runTask,
    estimateWorstCase: (task) => {
      const stage = stageById.get(task.stageId);
      if (!stage) return 1;
      return Math.max(1, Math.ceil(stage.tokenBudget.hardCap / stage.fanout.count));
    },
    buildShardItems: () => buildEvalShardItems(shardItemCount),
  });

  if (schedulerResult.cancelled) {
    failures.push("scheduler run was cancelled");
  }

  const allOutcomes = schedulerResult.stages.flatMap((s) => s.outcomes);
  if (allOutcomes.length === 0) {
    failures.push("scheduler produced zero task outcomes");
  }
  let schemaViolations = 0;
  let continuationAttempts = 0;
  let cacheHitTokens = 0;
  let criteriaMet = 0;
  let criteriaUnmet = 0;
  for (const outcome of allOutcomes) {
    if (outcome.status !== "success") {
      failures.push(`task ${outcome.taskId} did not succeed: status=${outcome.status}`);
      continue;
    }
    const value = outcome.value;
    const violations = value?.parsed.schemaViolations ?? 0;
    schemaViolations += violations;
    if (violations !== 0) {
      failures.push(`task ${outcome.taskId} produced ${String(violations)} schema violation(s)`);
    }
    if (value?.parsed.done !== true) {
      failures.push(`task ${outcome.taskId} did not report done`);
    }
    if (value) {
      continuationAttempts += value.continuationAttempts;
      cacheHitTokens += value.cacheHitTokens;
      if (value.continuationAttempts > 0 && value.continuationOutcome !== "completed") {
        failures.push(
          `task ${outcome.taskId} needed continuation but ended with outcome "${value.continuationOutcome}"`,
        );
      }
      const selfCheck = value.parsed.doneEnvelope?.selfCheck;
      if (selfCheck) {
        criteriaMet += selfCheck.criteriaMet.length;
        criteriaUnmet += selfCheck.unmet.length;
      }
    }
  }

  const durationMs = performance.now() - startedAt;
  const report = buildTokenReport(executionLedger);

  const { maxTokensSpent, maxDurationMs } = evalCase.assertions;
  if (maxTokensSpent !== undefined && report.grandTotalSpent > maxTokensSpent) {
    failures.push(
      `grandTotalSpent ${String(report.grandTotalSpent)} exceeds maxTokensSpent ${String(maxTokensSpent)}`,
    );
  }
  if (maxDurationMs !== undefined && durationMs > maxDurationMs) {
    failures.push(`durationMs ${durationMs.toFixed(1)} exceeds maxDurationMs ${String(maxDurationMs)}`);
  }

  return {
    id: evalCase.id,
    description: evalCase.description,
    tags: [...evalCase.tags],
    pass: failures.length === 0,
    failures,
    durationMs,
    tokensSpent: report.grandTotalSpent,
    costUsd: report.totalCostUsd,
    schemaViolations,
    continuationAttempts,
    cacheHitTokens,
    criteriaMet,
    criteriaUnmet,
    planSource: source,
    cancelled: schedulerResult.cancelled,
  };
}
