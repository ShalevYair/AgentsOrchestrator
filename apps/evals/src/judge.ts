import { collectGenerate, Ledger, runAdmitted } from "@ao/core";
import type { GenerateRequest, LLMProvider } from "@ao/shared";
import { z } from "zod";

/**
 * TASKS.md P11-T4 — an independent LLM judge scoring a real deliverable
 * against a rubric, on its own fixed budget that's never merged into the
 * golden task's own `Ledger`/`tokensSpent`. Distinct from
 * `doneEnvelope.selfCheck` (P11-T3's `criteriaMet`/`criteriaUnmet`) — that's
 * the *producing* agent grading its own homework; this is a separate call
 * checking the same criteria from the outside, the actual point of having
 * a judge at all.
 */
export interface RubricCriterion {
  id: string;
  description: string;
  /** Fraction of `JudgeResult.overallScore` this criterion contributes — every criterion's weight across a Rubric should sum to 1. */
  weight: number;
}

export interface Rubric {
  id: string;
  criteria: RubricCriterion[];
}

/**
 * Derives a Rubric directly from `TaskUnderstanding.acceptanceCriteria` —
 * real data every `EvalCase` already carries (P11-T1), not a new field
 * invented for the judge. Equal weight per criterion: nothing in
 * `acceptanceCriteria` itself ranks one criterion above another.
 */
export function rubricFromAcceptanceCriteria(criteria: readonly string[]): Rubric {
  const weight = criteria.length > 0 ? 1 / criteria.length : 0;
  return {
    id: "acceptance-criteria",
    criteria: criteria.map((description, index) => ({ id: `c${String(index + 1)}`, description, weight })),
  };
}

export const JudgeScoreSchema = z.strictObject({
  criterionId: z.string().min(1),
  score: z.number().min(0).max(1),
  rationale: z.string().min(1),
});
export type JudgeScore = z.infer<typeof JudgeScoreSchema>;

export const JudgeResponseSchema = z.strictObject({
  scores: z.array(JudgeScoreSchema),
});
export type JudgeResponse = z.infer<typeof JudgeResponseSchema>;

export interface JudgeResult {
  scores: JudgeScore[];
  /** Weighted sum of `scores[].score` by the matching `RubricCriterion.weight` — 0 for any criterion the judge's response never scored. */
  overallScore: number;
  /** Spent on the judge's own separate `Ledger`, created fresh inside `judgeDeliverable` — this number never appears in, and never reduces, the golden task's own `EvalCaseRunResult.tokensSpent`. */
  judgeTokensSpent: number;
}

/**
 * Fixed and separate from any golden task's own `budgetTotal` — the judge
 * always gets exactly this many tokens to work with, regardless of how
 * expensive or cheap the task it's grading was.
 */
export const JUDGE_BUDGET_TOKENS = 20_000;
const JUDGE_WORST_CASE = 5000;

/**
 * Exported so `mock-judge-provider.ts` can locate exactly the deliverable
 * text within the full prompt (start marker onward, up to the end
 * marker) instead of guessing — without an explicit end marker, "from the
 * start marker to the end of the string" would also capture the
 * instruction text `buildJudgePrompt` appends afterward, which is exactly
 * the bug a real test caught here (an empty deliverable was still scored
 * as if it had real content, because the "rest of the prompt" leaked in).
 */
export const DELIVERABLE_START_MARKER = "תוצר לבדיקה:\n";
export const DELIVERABLE_END_MARKER = "\n--- סוף התוצר ---";

function buildJudgePrompt(rubric: Rubric, deliverableText: string): string {
  return [
    "אתה שופט איכות בלתי-תלוי. קיבלת רשימת קריטריונים ותוצר בפועל.",
    "דרג כל קריטריון בנפרד, 0 עד 1, עם נימוק קצר. אל תתקן ואל תשכתב את התוצר עצמו.",
    "",
    `קריטריונים:\n${rubric.criteria.map((c) => `- ${c.id}: ${c.description}`).join("\n")}`,
    "",
    `${DELIVERABLE_START_MARKER}${deliverableText}${DELIVERABLE_END_MARKER}`,
    "",
    'החזר JSON יחיד: { "scores": [{ "criterionId", "score", "rationale" }, ...] } — שורה אחת לכל קריטריון.',
  ].join("\n");
}

export interface JudgeDeliverableParams {
  provider: LLMProvider;
  model: string;
  rubric: Rubric;
  deliverableText: string;
}

/**
 * Runs one judge call through a brand-new `Ledger` (total: `JUDGE_BUDGET_TOKENS`)
 * that this function creates itself and never receives from the caller —
 * structurally, there is no way for this spend to land in a golden task's
 * own execution Ledger, satisfying "לא נספר בתקציב המשימה" by construction,
 * not by convention.
 */
export async function judgeDeliverable(params: JudgeDeliverableParams): Promise<JudgeResult> {
  const judgeLedger = new Ledger({ total: JUDGE_BUDGET_TOKENS });
  const request: GenerateRequest = {
    model: params.model,
    contents: [{ role: "user", parts: [{ text: buildJudgePrompt(params.rubric, params.deliverableText) }] }],
    thinkingLevel: "low",
    responseSchema: JudgeResponseSchema,
  };

  const collectedText = await runAdmitted(
    judgeLedger,
    { bucket: "execution", stageId: "judge", worstCase: JUDGE_WORST_CASE },
    async () => {
      const collected = await collectGenerate(params.provider, request);
      return { usage: collected.usage, modelId: request.model, result: collected.text };
    },
  );

  const parsed: unknown = JSON.parse(collectedText);
  const validated = JudgeResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`judge response did not match JudgeResponseSchema: ${validated.error.message}`);
  }

  const weightByCriterion = new Map(params.rubric.criteria.map((c) => [c.id, c.weight]));
  let overallScore = 0;
  for (const score of validated.data.scores) {
    overallScore += score.score * (weightByCriterion.get(score.criterionId) ?? 0);
  }

  return {
    scores: validated.data.scores,
    overallScore,
    judgeTokensSpent: judgeLedger.spent,
  };
}
