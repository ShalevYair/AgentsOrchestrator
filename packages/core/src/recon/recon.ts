import {
  BudgetExceededError,
  SchemaValidationError,
  TaskUnderstandingSchema,
  type GenerateRequest,
  type LLMProvider,
  type TaskUnderstanding,
} from "@ao/shared";
import { collectGenerate } from "../continuation/index.js";
import { runAdmitted, type Ledger } from "../ledger/index.js";

/**
 * ARCHITECTURE.md §3, step 1's input contract, made structural rather than
 * just documented: `inventory` is expected to be R0/R1-only text (file
 * tree, sizes, languages, symbol map, entry points — ARCHITECTURE.md
 * §5.2's zero-cost rungs). There is deliberately no field here for raw
 * file content — recon's own done-criterion ("מקבל אינוונטר בלבד, לא
 * תוכן") can't be violated by a caller that has no parameter through which
 * to pass content in the first place.
 */
export interface ReconRequest {
  userRequest: string;
  inventory: string;
}

export interface RunReconParams {
  ledger: Ledger;
  provider: LLMProvider;
  /** `tier.cheap`'s resolved model id (ARCHITECTURE.md §4: recon runs on the cheap tier) — resolved by the caller against the model registry, `core` has none of its own. */
  model: string;
  stageId: string;
  request: ReconRequest;
  /** BUDGET.md §4.1's precomputed worst-case (provider.countTokens + output cap + thinking estimate) — same convention as `continuation.ts`. */
  worstCase: number;
}

function buildReconPrompt(request: ReconRequest): string {
  return [
    "אתה שלב ה-recon של מתזמר סוכנים. קיבלת אינוונטר בלבד — עץ קבצים, גדלים, שפות, מפת סמלים ונקודות",
    "כניסה — ולא את תוכן הקבצים עצמם. אל תניח הנחות על תוכן שלא נמסר לך.",
    "",
    `בקשת המשתמש:\n${request.userRequest}`,
    "",
    `אינוונטר (R0/R1 בלבד):\n${request.inventory}`,
    "",
    "החזר אובייקט JSON יחיד התואם בדיוק את הסכמה שסופקה — intent, deliverableShape, evidenceNeeds,",
    "acceptanceCriteria, ambiguities, suggestedRecipe, riskFlags.",
  ].join("\n");
}

function parseTaskUnderstanding(text: string): TaskUnderstanding {
  let json: unknown;
  try {
    json = JSON.parse(text.trim());
  } catch (error) {
    throw new SchemaValidationError(
      `recon response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = TaskUnderstandingSchema.safeParse(json);
  if (!result.success) {
    throw new SchemaValidationError(
      `recon response did not match TaskUnderstandingSchema: ${result.error.message}`,
    );
  }
  return result.data;
}

/**
 * P5-T2 — the single cheap `recon` call from ARCHITECTURE.md §3, step 1.
 * Routes through `runAdmitted` against the `"recon"` bucket for
 * attribution, but bucket membership alone is bookkeeping, not a spending
 * ceiling — `Ledger.commit` only ever checks the run-level `available`
 * (see `ledger.ts`), never a bucket's own remaining capacity. So "recon
 * costs under 2% of the budget" (this task's own done-criterion, matching
 * the recon bucket's fixed 2% allocation in BUDGET.md §3 /
 * `buckets.ts`'s `DEFAULT_BUCKET_PERCENTAGES.recon`) is enforced here
 * explicitly, before admission is even attempted: a `worstCase` that
 * wouldn't fit in what's left of the recon bucket's own allocation is
 * rejected outright, without ever reaching the provider.
 */
export async function runRecon(params: RunReconParams): Promise<TaskUnderstanding> {
  const reconBucket = params.ledger.bucketSnapshot("recon");
  if (params.worstCase > reconBucket.available) {
    throw new BudgetExceededError(
      `recon worstCase (${String(params.worstCase)}) exceeds the recon bucket's remaining allocation ` +
        `(${String(reconBucket.available)} of ${String(reconBucket.allocated)}) — recon must stay within its ` +
        "fixed 2% share of the budget (BUDGET.md §3)",
      {
        details: {
          stageId: params.stageId,
          worstCase: params.worstCase,
          reconAvailable: reconBucket.available,
        },
      },
    );
  }

  const generateRequest: GenerateRequest = {
    model: params.model,
    contents: [{ role: "user", parts: [{ text: buildReconPrompt(params.request) }] }],
    thinkingLevel: "low",
    responseSchema: TaskUnderstandingSchema,
  };

  return runAdmitted(
    params.ledger,
    { bucket: "recon", stageId: params.stageId, worstCase: params.worstCase },
    async () => {
      const collected = await collectGenerate(params.provider, generateRequest);
      const result = parseTaskUnderstanding(collected.text);
      return { usage: collected.usage, modelId: generateRequest.model, result };
    },
  );
}

export { buildReconPrompt };
