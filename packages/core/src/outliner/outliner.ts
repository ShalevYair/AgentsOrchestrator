import {
  BudgetExceededError,
  OutlineSpecSchema,
  SchemaValidationError,
  type GenerateRequest,
  type LLMProvider,
  type OutlineSpec,
} from "@ao/shared";
import { collectGenerate } from "../continuation/index.js";
import { runAdmitted, type Ledger } from "../ledger/index.js";

/**
 * ARCHITECTURE.md §6 / §4: "outliner מייצר שלד עם מזהים, מטרות וגדלים
 * צפויים". Structural version of the same "no raw content" pattern
 * `recon.ts`/`toolsmith.ts` established (P5-T2/P7-T4): the outliner needs
 * to know *what* it's outlining, not the material itself — `deliverableSummary`
 * is meant to carry the already-cheap `TaskUnderstanding`/recon output, not
 * ingested file content, so there is deliberately no field here through
 * which a caller could pass raw material.
 */
export interface OutlinerRequest {
  userRequest: string;
  deliverableSummary: string;
}

/**
 * ARCHITECTURE.md §4's per-role output caps (writer: 12K, coder: 16K by
 * default) — resolved by the caller against its own agent registry
 * (P10-T1/T3), same as every model-id/tier lookup elsewhere in this
 * package. `core` has no registry of its own to consult.
 */
export interface SectionOwnerCaps {
  writer: number;
  coder: number;
}

export interface RunOutlinerParams {
  ledger: Ledger;
  provider: LLMProvider;
  /** `tier.worker`'s resolved model id (ARCHITECTURE.md §4: `outliner` is a worker-tier agent). */
  model: string;
  stageId: string;
  request: OutlinerRequest;
  /** BUDGET.md §4.1's precomputed worst-case for this generation call — same convention as every other admission call site in this package. */
  worstCase: number;
  ownerCaps: SectionOwnerCaps;
}

export interface OutlinerOutcome {
  outline: OutlineSpec;
  /** The real `usage.candidatesTokens` from the response — not an estimate (ARCHITECTURE.md §6's "פלט קטן" is checked against what actually came back, the same empirical-over-assumed discipline P7-T4's 369-token measurement used). */
  outputTokens: number;
}

/** ARCHITECTURE.md §4: `outliner`'s typical output cap. Requested from the provider via `GenerateRequest.maxOutputTokens`, and re-checked against the real returned usage below as defense-in-depth (a provider is expected to already honor the cap; this catches it if one doesn't rather than trusting silently). */
export const OUTLINER_MAX_OUTPUT_TOKENS = 4000;

function buildOutlinerPrompt(request: OutlinerRequest): string {
  return [
    "אתה סוכן ה-outliner של מתזמר סוכנים. תפקידך לבנות שלד לתוצר — לא לכתוב אף מילה מהתוכן עצמו.",
    "לכל סעיף קבע מזהה יציב, כותרת, מטרה קצרה, איזה סוג סוכן יבעל אותו (writer לפרוזה/markdown,",
    "coder לקובץ קוד — ואז חובה למלא path), וכמה טוקנים הפלט של הסעיף הזה צפוי לדרוש.",
    "כל סעיף חייב להישאר קטן מספיק שסוכן יחיד יכול לכתוב אותו במלואו בקריאה אחת — עדיף לפצל לסעיפים",
    "רבים וקטנים מאשר מעט וגדולים.",
    "",
    `בקשת המשתמש:\n${request.userRequest}`,
    "",
    `תיאור צורת התוצר (מ-recon, לא תוכן גולמי):\n${request.deliverableSummary}`,
    "",
    "החזר אובייקט JSON יחיד התואם בדיוק את הסכמה שסופקה — id, sections (כל סעיף: id, title, goal,",
    "deliverableKind, expectedOutputTokens, ו-path רק כש-deliverableKind הוא files).",
  ].join("\n");
}

function parseOutlineSpec(text: string): OutlineSpec {
  let json: unknown;
  try {
    json = JSON.parse(text.trim());
  } catch (error) {
    throw new SchemaValidationError(
      `outliner response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = OutlineSpecSchema.safeParse(json);
  if (!result.success) {
    throw new SchemaValidationError(
      `outliner response did not match OutlineSpecSchema: ${result.error.message}`,
    );
  }
  return result.data;
}

/** Owning-agent-type per section, mirroring `plan/types.ts`'s `DELIVERABLE_KIND_AGENT_TYPES` (`markdown` -> `writer`, `files` -> `coder`) — not imported directly since that table also carries `analyst`/`reader`/etc. entries the outliner never produces. */
function ownerCapFor(section: OutlineSpec["sections"][number], caps: SectionOwnerCaps): number {
  return section.deliverableKind === "markdown" ? caps.writer : caps.coder;
}

/**
 * Every section's `expectedOutputTokens` must fit under its owning agent
 * type's real cap (P8-T1's own done-criterion) — checked here, immediately
 * after parsing, rather than left for a downstream consumer to discover
 * mid-run. Throws listing every offending section at once (not just the
 * first) so a caller building a repair prompt has everything it needs in
 * one round-trip.
 */
function assertSectionSizesFitOwnerCaps(outline: OutlineSpec, caps: SectionOwnerCaps): void {
  const oversized = outline.sections.filter(
    (section) => section.expectedOutputTokens > ownerCapFor(section, caps),
  );
  if (oversized.length === 0) return;
  const detail = oversized
    .map((s) => `"${s.id}" (${String(s.expectedOutputTokens)} > ${String(ownerCapFor(s, caps))})`)
    .join(", ");
  throw new SchemaValidationError(
    `outliner produced ${String(oversized.length)} section(s) whose expectedOutputTokens exceeds their ` +
      `owning agent type's cap: ${detail}`,
    { details: { oversizedSectionIds: oversized.map((s) => s.id) } },
  );
}

/**
 * P8-T1 — a single structured-output call, same shape as
 * `recon.ts`/`checkpoint/agent.ts`/`toolsmith.ts` (P5-T2, P6-T2, P7-T4):
 * one JSON object back, not P5-T6's generic NDJSON runner. Routes through
 * the `"execution"` bucket (BUDGET.md §3, 58%) with the same explicit
 * bucket-capacity check `recon.ts` established (`Ledger.commit` only checks
 * run-level `available`, never a bucket's own remaining capacity) — the
 * outliner is a `worker`-tier agent doing a Stage's own step-0 work
 * (ARCHITECTURE.md §4), the same bucket `toolsmith` uses for the same
 * reason.
 */
export async function runOutliner(params: RunOutlinerParams): Promise<OutlinerOutcome> {
  const executionBucket = params.ledger.bucketSnapshot("execution");
  if (params.worstCase > executionBucket.available) {
    throw new BudgetExceededError(
      `outliner worstCase (${String(params.worstCase)}) exceeds the execution bucket's remaining ` +
        `allocation (${String(executionBucket.available)} of ${String(executionBucket.allocated)}) — ` +
        "outliner generation must stay within the execution bucket's share of the budget (BUDGET.md §3)",
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
    contents: [{ role: "user", parts: [{ text: buildOutlinerPrompt(params.request) }] }],
    thinkingLevel: "medium",
    responseSchema: OutlineSpecSchema,
    maxOutputTokens: OUTLINER_MAX_OUTPUT_TOKENS,
  };

  // Every validation below runs *inside* the admitted call, before it
  // returns — a violation throws from within `execute`, so `runAdmitted`
  // releases the reservation instead of settling it (same as an invalid
  // JSON/schema response from `recon.ts`/`checkpoint/agent.ts`/`toolsmith.ts`;
  // this task's new checks follow that same established convention rather
  // than introducing a second failure-handling shape).
  return runAdmitted(
    params.ledger,
    { bucket: "execution", stageId: params.stageId, worstCase: params.worstCase },
    async () => {
      const collected = await collectGenerate(params.provider, generateRequest);
      const outline = parseOutlineSpec(collected.text);
      const outputTokens = collected.usage.candidatesTokens;

      if (outputTokens > OUTLINER_MAX_OUTPUT_TOKENS) {
        throw new SchemaValidationError(
          `outliner output was ${String(outputTokens)} tokens, exceeding its ${String(OUTLINER_MAX_OUTPUT_TOKENS)}-token cap ` +
            "(ARCHITECTURE.md §4) — the skeleton itself must stay small",
          { details: { stageId: params.stageId, outputTokens } },
        );
      }
      assertSectionSizesFitOwnerCaps(outline, params.ownerCaps);

      return { usage: collected.usage, modelId: generateRequest.model, result: { outline, outputTokens } };
    },
  );
}

export { buildOutlinerPrompt };
