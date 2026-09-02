import {
  BudgetExceededError,
  PlanInvalidError,
  PlanSchema,
  type GenerateRequest,
  type LLMProvider,
  type Plan,
  type TaskUnderstanding,
} from "@ao/shared";
import { collectGenerate } from "../continuation/index.js";
import { runAdmitted, type Ledger } from "../ledger/index.js";
import { validatePlan, type PlanValidationContext, type PlanValidationIssue } from "../plan/index.js";

export interface RunPlannerParams {
  ledger: Ledger;
  provider: LLMProvider;
  /** `tier.worker`'s resolved model id — ARCHITECTURE.md §7: planning runs at `thinkingLevel: "high"`. */
  model: string;
  stageId: string;
  understanding: TaskUnderstanding;
  /** Same R0/R1-only inventory contract as recon (P5-T2) — the planner never sees raw content either. */
  inventory: string;
  recipes?: readonly string[];
  /** The same context P5-T1's `validatePlan` needs (budgetTotal, budgetLevel, knownAgentTypes, modelMaxOutputTokens, ...) — every candidate plan is validated against it before being accepted. */
  validationContext: PlanValidationContext;
  /** BUDGET.md §4.1's precomputed worst-case, applied to *each* attempt (initial + every repair) — repairs are explicitly part of the `planning` bucket's own allocation (BUDGET.md §3: "בניית התוכנית (+ תיקונים)"), unlike continuation's separate `repair` bucket. */
  worstCasePerAttempt: number;
  /** How many repair attempts to allow after the first try. Default 2 (3 attempts total). */
  maxRepairAttempts?: number;
}

export interface PlannerAttempt {
  attemptNumber: number;
  issues: PlanValidationIssue[];
}

export interface PlannerResult {
  plan: Plan;
  /** Every rejected attempt before the accepted one — empty when the first try already validated. */
  attempts: PlannerAttempt[];
}

function buildPlannerPrompt(
  understanding: TaskUnderstanding,
  inventory: string,
  recipes: readonly string[],
): string {
  return [
    "אתה ה-planner של מתזמר סוכנים. קיבלת את הבנת המשימה (TaskUnderstanding) ואינוונטר בלבד — לא תוכן קבצים.",
    "בנה Plan תקף: DAG של stages, fan-out, תקציב וקריטריון הצלחה לכל שלב, בתוך התקציב הכולל.",
    "",
    `TaskUnderstanding:\n${JSON.stringify(understanding, null, 2)}`,
    "",
    `אינוונטר (R0/R1 בלבד):\n${inventory}`,
    recipes.length > 0 ? `\nמתכונים זמינים: ${recipes.join(", ")}` : "",
    "",
    "החזר אובייקט JSON יחיד התואם בדיוק את סכמת ה-Plan שסופקה.",
  ].join("\n");
}

function buildRepairPrompt(
  understanding: TaskUnderstanding,
  inventory: string,
  recipes: readonly string[],
  priorIssues: readonly PlanValidationIssue[],
): string {
  const issuesText = priorIssues.map((issue) => `- [${issue.code}] ${issue.message}`).join("\n");
  return [
    buildPlannerPrompt(understanding, inventory, recipes),
    "",
    "התוכנית הקודמת שלך נדחתה בוולידציה המקומית עם הבעיות הבאות. תקן את **כולן** ושלח תוכנית מלאה ותקינה",
    "מחדש (לא diff/patch — תוכנית שלמה):",
    issuesText,
  ].join("\n");
}

function tryParseJson(
  text: string,
): { ok: true; value: unknown } | { ok: false; issue: PlanValidationIssue } {
  try {
    return { ok: true, value: JSON.parse(text.trim()) };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "V1",
        message: `planner response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * P5-T3 — ARCHITECTURE.md §3, step 2: produces a DAG-shaped `Plan` within
 * budget, with per-stage estimates. Every candidate response is run
 * through P5-T1's `validatePlan` (all 8 V-checks) before ever being
 * accepted; a budget overrun (V2) or any other violation is never silently
 * accepted — it's rejected and fed back to the model as a repair prompt
 * (this task's own done-criterion), up to `maxRepairAttempts` times.
 * Exhausting every attempt throws `PlanInvalidError` — an invalid plan
 * this function returns is a contradiction in terms, matching P5-T1's own
 * done-criterion that an invalid plan never starts executing.
 */
export async function runPlanner(params: RunPlannerParams): Promise<PlannerResult> {
  const maxAttempts = (params.maxRepairAttempts ?? 2) + 1;
  const recipes = params.recipes ?? [];
  const attempts: PlannerAttempt[] = [];
  let priorIssues: PlanValidationIssue[] = [];

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
    const planningBucket = params.ledger.bucketSnapshot("planning");
    if (params.worstCasePerAttempt > planningBucket.available) {
      throw new BudgetExceededError(
        `planner worstCase (${String(params.worstCasePerAttempt)}) exceeds the planning bucket's remaining ` +
          `allocation (${String(planningBucket.available)} of ${String(planningBucket.allocated)})`,
        { details: { stageId: params.stageId, attemptNumber, worstCase: params.worstCasePerAttempt } },
      );
    }

    const prompt =
      attemptNumber === 1
        ? buildPlannerPrompt(params.understanding, params.inventory, recipes)
        : buildRepairPrompt(params.understanding, params.inventory, recipes, priorIssues);

    const generateRequest: GenerateRequest = {
      model: params.model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      thinkingLevel: "high",
      responseSchema: PlanSchema,
    };

    const parseOutcome = await runAdmitted(
      params.ledger,
      { bucket: "planning", stageId: params.stageId, worstCase: params.worstCasePerAttempt },
      async () => {
        const collected = await collectGenerate(params.provider, generateRequest);
        return {
          usage: collected.usage,
          modelId: generateRequest.model,
          result: tryParseJson(collected.text),
        };
      },
    );

    if (!parseOutcome.ok) {
      attempts.push({ attemptNumber, issues: [parseOutcome.issue] });
      priorIssues = [parseOutcome.issue];
      continue;
    }

    const validation = validatePlan(parseOutcome.value, params.validationContext);
    if (validation.valid && validation.plan) {
      return { plan: validation.plan, attempts };
    }
    attempts.push({ attemptNumber, issues: validation.issues });
    priorIssues = validation.issues;
  }

  const summary = priorIssues.map((issue) => `[${issue.code}] ${issue.message}`).join("; ");
  throw new PlanInvalidError(
    `planner failed to produce a valid plan after ${String(maxAttempts)} attempt(s): ${summary}`,
    { details: { stageId: params.stageId, attempts } },
  );
}

export { buildPlannerPrompt, buildRepairPrompt };
