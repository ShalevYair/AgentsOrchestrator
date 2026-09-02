import {
  BudgetExceededError,
  LocalToolSchema,
  SchemaValidationError,
  type GenerateRequest,
  type LLMProvider,
  type LocalTool,
  type ToolResult,
} from "@ao/shared";
import { collectGenerate } from "../continuation/index.js";
import { runAdmitted, type Ledger } from "../ledger/index.js";

/**
 * ARCHITECTURE.md §5.2's R3 / §8: "toolsmith מקבל תיאור נתונים (סכמה, לא
 * תוכן)". Structural version of the same pattern `recon.ts`'s
 * `ReconRequest` established (P5-T2): `dataDescription` is meant to carry
 * only shape/schema information (file tree, column names + types, sizes —
 * R0/R1) — there is deliberately no field here for actual file/row content,
 * so a caller has no parameter through which to pass raw content in the
 * first place.
 */
export interface ToolsmithRequest {
  userRequest: string;
  dataDescription: string;
}

/**
 * Actually executes the `LocalTool` the model wrote and returns its
 * `ToolResult`. Injected rather than imported so `packages/core` never
 * depends on `@ao/tools` in production code — only as a devDependency for
 * the scenario test proving this task's own done-criterion. Same
 * dependency-injection boundary as `LLMProvider` itself (P1-T1's "core
 * depends only on the abstract contract, never a concrete implementation").
 */
export type RunLocalTool = (tool: LocalTool) => Promise<ToolResult>;

export interface RunToolsmithParams {
  ledger: Ledger;
  provider: LLMProvider;
  /** `tier.worker`'s resolved model id (ARCHITECTURE.md §4: `toolsmith` is a worker-tier agent), resolved by the caller against the model registry — `core` has none of its own. */
  model: string;
  stageId: string;
  request: ToolsmithRequest;
  /** BUDGET.md §4.1's precomputed worst-case for the *generation* call only — same convention as every other admission call site in this package. Running the resulting script has no LLM cost of its own. */
  worstCase: number;
  runLocalTool: RunLocalTool;
}

export interface ToolsmithOutcome {
  tool: LocalTool;
  result: ToolResult;
}

export function buildToolsmithPrompt(request: ToolsmithRequest): string {
  return [
    "אתה סוכן ה-toolsmith של מתזמר סוכנים. קיבלת רק תיאור צורת הנתונים (סכמה) — לא את התוכן עצמו,",
    "ולעולם אסור לך להניח הנחות על תוכן שלא נמסר לך.",
    "",
    "כתוב סקריפט Python או Node שירוץ מקומית מול הנתונים ויענה על הבקשה. הסקריפט מקבל שני ארגומנטים:",
    "נתיב לקובץ הסקריפט עצמו, ונתיב לקובץ JSON עם inputs (התאם ל-inputs שתגדיר בסכמה). הדפס ל-stdout",
    "תוצאה קטנה בלבד — לעולם לא את הנתונים הגולמיים.",
    "",
    `בקשת המשתמש:\n${request.userRequest}`,
    "",
    `תיאור צורת הנתונים (סכמה בלבד, לא תוכן):\n${request.dataDescription}`,
    "",
    "החזר אובייקט JSON יחיד התואם בדיוק את הסכמה שסופקה — id, runtime, source, script, inputs, limits,",
    'expectedOutput. source חייב להיות "inline". אם expectedOutput הוא "json", הסקריפט חייב להדפיס',
    "בדיוק אובייקט JSON יחיד ל-stdout ולא עוד דבר.",
  ].join("\n");
}

function parseLocalTool(text: string): LocalTool {
  let json: unknown;
  try {
    json = JSON.parse(text.trim());
  } catch (error) {
    throw new SchemaValidationError(
      `toolsmith response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = LocalToolSchema.safeParse(json);
  if (!result.success) {
    throw new SchemaValidationError(
      `toolsmith response did not match LocalToolSchema: ${result.error.message}`,
    );
  }
  return result.data;
}

/**
 * P7-T4 — toolsmith is a `worker`-tier agent (ARCHITECTURE.md §4) producing
 * a single structured `LocalTool` object, the same way recon/planner/
 * checkpoint do (P5-T2/T3, P6-T2) rather than P5-T6's generic NDJSON runner
 * (which is for free-form multi-line worker output). Routes through the
 * `"execution"` bucket (BUDGET.md §3: 58%, "עבודת הסוכנים בפועל") with the
 * same explicit bucket-capacity check `recon.ts` established: `Ledger.
 * commit` only ever checks run-level `available`, never a bucket's own
 * remaining capacity, so staying within a bucket's share has to be checked
 * here explicitly.
 *
 * After the model returns a valid `LocalTool`, it is actually executed via
 * the injected `runLocalTool` — this is the R3 payoff (ARCHITECTURE.md
 * §5.2): the context only ever grows by the prompt + the small script +
 * the small result, never by the underlying data itself.
 */
export async function runToolsmith(params: RunToolsmithParams): Promise<ToolsmithOutcome> {
  const executionBucket = params.ledger.bucketSnapshot("execution");
  if (params.worstCase > executionBucket.available) {
    throw new BudgetExceededError(
      `toolsmith worstCase (${String(params.worstCase)}) exceeds the execution bucket's remaining ` +
        `allocation (${String(executionBucket.available)} of ${String(executionBucket.allocated)}) — ` +
        "toolsmith generation must stay within the execution bucket's share of the budget (BUDGET.md §3)",
      {
        details: {
          stageId: params.stageId,
          worstCase: params.worstCase,
          executionAvailable: executionBucket.available,
        },
      },
    );
  }

  const generateRequest: GenerateRequest = {
    model: params.model,
    contents: [{ role: "user", parts: [{ text: buildToolsmithPrompt(params.request) }] }],
    thinkingLevel: "medium",
    responseSchema: LocalToolSchema,
  };

  const tool = await runAdmitted(
    params.ledger,
    { bucket: "execution", stageId: params.stageId, worstCase: params.worstCase },
    async () => {
      const collected = await collectGenerate(params.provider, generateRequest);
      const result = parseLocalTool(collected.text);
      return { usage: collected.usage, modelId: generateRequest.model, result };
    },
  );

  const result = await params.runLocalTool(tool);
  return { tool, result };
}
