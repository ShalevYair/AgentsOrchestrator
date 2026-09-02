import {
  BudgetExceededError,
  CheckpointDecisionSchema,
  SchemaValidationError,
  type CheckpointDecision,
  type GenerateRequest,
  type LLMProvider,
} from "@ao/shared";
import { collectGenerate } from "../continuation/index.js";
import { runAdmitted, type Ledger } from "../ledger/index.js";

export interface RunCheckpointParams {
  ledger: Ledger;
  provider: LLMProvider;
  /** `tier.cheap`'s resolved model id (ARCHITECTURE.md §4: the `checkpoint` agent runs on the cheap tier), resolved by the caller against the model registry — `core` has none of its own. */
  model: string;
  stageId: string;
  /** Already-built and capped state summary text (`buildCheckpointStateSummary`, this same module) — the checkpoint agent never sees a stage's raw output, only this. */
  summary: string;
  /** BUDGET.md §4.1's precomputed worst-case (provider.countTokens + output cap + thinking estimate) — same convention as every other admission call site in this package. */
  worstCase: number;
}

function buildCheckpointPrompt(summary: string): string {
  return [
    "אתה שלב ה-checkpoint של מתזמר סוכנים. קיבלת תקציר מצב מצומצם (לא את הפלט הגולמי של השלב) ואת",
    "האותות שכבר חושבו מקומית. החלט האם להמשיך, לתקן את התוכנית (JSON Patch), לתכנן מחדש, או לעצור.",
    "",
    `תקציר מצב:\n${summary}`,
    "",
    "החזר אובייקט JSON יחיד התואם בדיוק את הסכמה שסופקה — decision, reason, patch, confidence.",
    "patch הוא RFC 6902 JSON Patch. אל תרחיב אף פעם את התקציב — כל תיקון שמנסה לעשות זאת יידחה.",
  ].join("\n");
}

function parseCheckpointDecision(text: string): CheckpointDecision {
  let json: unknown;
  try {
    json = JSON.parse(text.trim());
  } catch (error) {
    throw new SchemaValidationError(
      `checkpoint response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = CheckpointDecisionSchema.safeParse(json);
  if (!result.success) {
    throw new SchemaValidationError(
      `checkpoint response did not match CheckpointDecisionSchema: ${result.error.message}`,
    );
  }
  return result.data;
}

/**
 * P6-T2 — the single cheap `checkpoint` call from PROTOCOLS.md §6: a
 * single structured `CheckpointDecision` object (like recon/planner,
 * P5-T2/T3 — not P5-T6's generic NDJSON agent runner, which is for
 * free-form worker output). Routes through the `"checkpoints"` bucket
 * (BUDGET.md §3: 4%) with the same explicit bucket-capacity check
 * `recon.ts`/`planner.ts` already established: `Ledger.commit` only ever
 * checks run-level `available`, never a bucket's own remaining capacity
 * (see `recon.ts`'s doc comment for the test that caught this the first
 * time), so "all checkpoints together stay under 4% of the budget" — this
 * task's own done-criterion — is enforced here explicitly, before
 * admission is even attempted.
 */
export async function runCheckpoint(params: RunCheckpointParams): Promise<CheckpointDecision> {
  const checkpointsBucket = params.ledger.bucketSnapshot("checkpoints");
  if (params.worstCase > checkpointsBucket.available) {
    throw new BudgetExceededError(
      `checkpoint worstCase (${String(params.worstCase)}) exceeds the checkpoints bucket's remaining ` +
        `allocation (${String(checkpointsBucket.available)} of ${String(checkpointsBucket.allocated)}) — ` +
        "checkpoints must stay within their fixed 4% share of the budget (BUDGET.md §3)",
      {
        details: {
          stageId: params.stageId,
          worstCase: params.worstCase,
          checkpointsAvailable: checkpointsBucket.available,
        },
      },
    );
  }

  const generateRequest: GenerateRequest = {
    model: params.model,
    contents: [{ role: "user", parts: [{ text: buildCheckpointPrompt(params.summary) }] }],
    thinkingLevel: "low",
    responseSchema: CheckpointDecisionSchema,
  };

  return runAdmitted(
    params.ledger,
    { bucket: "checkpoints", stageId: params.stageId, worstCase: params.worstCase },
    async () => {
      const collected = await collectGenerate(params.provider, generateRequest);
      const result = parseCheckpointDecision(collected.text);
      return { usage: collected.usage, modelId: generateRequest.model, result };
    },
  );
}

export { buildCheckpointPrompt };
