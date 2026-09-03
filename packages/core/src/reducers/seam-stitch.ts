import {
  ConfigError,
  SchemaValidationError,
  SeamStitchResponseSchema,
  type GenerateRequest,
  type LLMProvider,
  type Usage,
} from "@ao/shared";
import { collectGenerate } from "../continuation/index.js";
import type { Ledger, Reservation } from "../ledger/index.js";

/**
 * P8-T5 — "תפירת תפרים: LLM רק על תפר שנכשל, לעולם לא על התוצר כולו".
 * This is the *executing* counterpart to `llm-synthesize.ts`'s
 * `makeLlmSynthesizeReducer`: that function only ever *flags*
 * `needsLlmStitch` with a fallback value (by design — `Reducer`s stay pure
 * and `packages/core` stays I/O-free, PROTOCOLS.md §8), it never actually
 * calls a provider. This module is the thing a caller invokes once it has
 * decided a stitch is needed and is ready to spend real (reserve) budget
 * on it — same "core defines the logic, a real caller supplies the I/O"
 * split every other LLM-calling module in this package uses.
 *
 * The one requirement this module exists to enforce that `llm-synthesize.ts`
 * structurally can't (it has no scope of its own to bound — `stitchScope`
 * there is just "every task that fed the reduction"): a seam must stay a
 * seam. `assertBoundedSeamScope` is checked *before* a single token is
 * spent, and the response is checked *again* after the call returns
 * (`assertResponseWithinScope`) — the second check matters even though the
 * prompt already asks for a narrow scope, because a prompt is a request,
 * not a guarantee; only a structural check on the actual returned ids is.
 */
export const MAX_SEAM_SPAN = 3;

export interface SeamStitchViolation {
  /** The narrow locality a P8-T4 validator already computed (`DocumentViolation.sectionIds` / `CodeViolation.filePaths`, adapted by the caller into this common shape) — this module doesn't know or care which validator produced it. */
  sectionIds: readonly string[];
  detail: string;
}

export interface SeamStitchTarget {
  id: string;
  currentContent: string;
}

export interface RunSeamStitchParams {
  ledger: Ledger;
  provider: LLMProvider;
  /** `tier.worker`'s resolved model id — a seam fix is worker-tier work (ARCHITECTURE.md §4), same as the original section-writing agent. */
  model: string;
  stageId: string;
  violation: SeamStitchViolation;
  /** The current content of every id named in `violation.sectionIds` — must cover exactly that set (no more, no less caught here structurally; see `runSeamStitch`). */
  targets: readonly SeamStitchTarget[];
  /** BUDGET.md §4.1's precomputed worst-case for this generation call — same convention as every other admission call site in this package, but this one is drawn from `reserve` (P8-T5's own done-criterion), never a normal bucket. */
  worstCase: number;
  /** Total section count of the assembled document, when the caller has it handy — lets `assertBoundedSeamScope` also reject a seam that happens to name *every* section even if that's `<= MAX_SEAM_SPAN` for a very small document. Optional because not every caller can cheaply supply it. */
  totalSections?: number;
}

export interface StitchLogEntry {
  sectionIds: string[];
  reason: string;
  /** Real tokens spent, from `Ledger.settle`'s own accounting — not the requested `worstCase`. */
  tokensSpent: number;
  /** True if the reserve pool couldn't grant the full `worstCase` (BUDGET.md §5 level 8's own clamping behavior) — surfaced so a caller can report a possibly-incomplete stitch rather than assume it got everything it asked for. */
  clamped: boolean;
}

export interface SeamStitchOutcome {
  correctedSections: Readonly<Record<string, string>>;
  log: StitchLogEntry;
}

/**
 * Structural bound on how wide a seam is allowed to be, checked before any
 * budget is drawn or any call made. `totalSections`, when supplied, closes
 * the loophole where a tiny document's "everything" still happens to fit
 * under `MAX_SEAM_SPAN`.
 */
export function assertBoundedSeamScope(sectionIds: readonly string[], totalSections?: number): void {
  if (sectionIds.length === 0) {
    throw new ConfigError("seam scope must name at least one section — an empty scope has nothing to stitch");
  }
  if (sectionIds.length > MAX_SEAM_SPAN) {
    throw new ConfigError(
      `seam scope names ${String(sectionIds.length)} section(s), exceeding the ${String(MAX_SEAM_SPAN)}-section ` +
        "bound — stitching must stay bounded to the seam, never the whole document (ADR-002)",
      { details: { sectionIds, maxSeamSpan: MAX_SEAM_SPAN } },
    );
  }
  if (totalSections !== undefined && sectionIds.length >= totalSections) {
    throw new ConfigError(
      `seam scope covers the entire document (${String(sectionIds.length)} of ${String(totalSections)} sections) ` +
        "— LLM stitching must never touch the whole assembled document (ADR-002)",
      { details: { sectionIds, totalSections } },
    );
  }
}

function buildSeamStitchPrompt(violation: SeamStitchViolation, targets: readonly SeamStitchTarget[]): string {
  const targetBlocks = targets
    .map((t) => `--- section "${t.id}" (current content) ---\n${t.currentContent}`)
    .join("\n\n");
  return [
    "אתה נכנס רק לתפירת תפר בודד בתוצר גדול שכבר הורכב — לעולם אל תשנה או תמציא תוכן מחוץ לסעיפים",
    "שסופקו לך כאן. אימות מקומי מצא בעיה בדיוק בגבול שביניהם:",
    "",
    violation.detail,
    "",
    "תוכן הסעיפים הנוגעים בדבר (רק אלה, אף אחד אחר):",
    targetBlocks,
    "",
    "החזר אובייקט JSON יחיד התואם בדיוק את הסכמה שסופקה — sections: מערך של {id, correctedBody},",
    `אחד לכל היותר לכל אחד מהמזהים: ${targets.map((t) => `"${t.id}"`).join(", ")}. אל תחזיר מזהה אחר.`,
  ].join("\n");
}

function parseSeamStitchResponse(text: string): { sections: { id: string; correctedBody: string }[] } {
  let json: unknown;
  try {
    json = JSON.parse(text.trim());
  } catch (error) {
    throw new SchemaValidationError(
      `seam stitch response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = SeamStitchResponseSchema.safeParse(json);
  if (!result.success) {
    throw new SchemaValidationError(
      `seam stitch response did not match SeamStitchResponseSchema: ${result.error.message}`,
    );
  }
  return result.data;
}

/**
 * The one path in this module that can spend from `reserve` — mirrors
 * `runAdmitted`'s (ledger/admission.ts) settle-on-success /
 * release-on-failure shape, but built on `Ledger.drawFromReserve` instead
 * of `admit`/`commit`, since `runAdmitted` only ever targets a normal
 * `BudgetBucketId` bucket and `reserve` deliberately isn't one
 * (ledger/types.ts). Kept local to this module rather than added to
 * `ledger/admission.ts` — P4 is already shipped, and this is currently
 * the only caller that needs a reserve-budgeted admitted call.
 */
async function runFromReserve<T>(
  ledger: Ledger,
  options: { stageId: string; agentType?: string },
  amount: number,
  execute: (reservation: Reservation) => Promise<{ usage: Usage; modelId?: string; result: T }>,
): Promise<{ result: T; reservation: Reservation; tokensSpent: number }> {
  const reservation = ledger.drawFromReserve(amount, options);
  try {
    const { usage, modelId, result } = await execute(reservation);
    const settlement = ledger.settle(reservation, usage, modelId);
    return { result, reservation, tokensSpent: settlement.tokensSpent };
  } catch (error) {
    ledger.release(reservation);
    throw error;
  }
}

/**
 * Runs one bounded, reserve-budgeted LLM call to fix exactly the seam
 * named by `violation.sectionIds` — nothing wider. Enforced twice: before
 * any spend (`assertBoundedSeamScope`, plus `targets` must cover exactly
 * the violation's own ids — no silent extra scope smuggled in through
 * `targets`), and again after the response comes back (any returned id
 * outside the requested set fails the whole call rather than being
 * silently accepted, applied, or dropped).
 */
export async function runSeamStitch(params: RunSeamStitchParams): Promise<SeamStitchOutcome> {
  assertBoundedSeamScope(params.violation.sectionIds, params.totalSections);

  const targetIds = new Set(params.targets.map((t) => t.id));
  for (const id of params.violation.sectionIds) {
    if (!targetIds.has(id)) {
      throw new ConfigError(`seam target "${id}" named by the violation was not supplied in "targets"`, {
        details: { missingId: id, suppliedTargetIds: [...targetIds] },
      });
    }
  }
  if (targetIds.size !== params.violation.sectionIds.length) {
    throw new ConfigError(
      '"targets" must cover exactly "violation.sectionIds" — no extra targets beyond the seam',
      {
        details: { violationSectionIds: params.violation.sectionIds, targetIds: [...targetIds] },
      },
    );
  }

  const generateRequest: GenerateRequest = {
    model: params.model,
    contents: [{ role: "user", parts: [{ text: buildSeamStitchPrompt(params.violation, params.targets) }] }],
    thinkingLevel: "medium",
    responseSchema: SeamStitchResponseSchema,
  };

  const { result, reservation, tokensSpent } = await runFromReserve(
    params.ledger,
    { stageId: params.stageId },
    params.worstCase,
    async () => {
      const collected = await collectGenerate(params.provider, generateRequest);
      const parsed = parseSeamStitchResponse(collected.text);

      for (const section of parsed.sections) {
        if (!targetIds.has(section.id)) {
          throw new SchemaValidationError(
            `seam stitch response touched section "${section.id}", which is outside the requested seam ` +
              `scope (${[...targetIds].join(", ")}) — a stitch may only touch what it was asked about`,
            { details: { returnedId: section.id, allowedIds: [...targetIds] } },
          );
        }
      }

      const correctedSections: Record<string, string> = {};
      for (const section of parsed.sections) correctedSections[section.id] = section.correctedBody;
      return { usage: collected.usage, modelId: generateRequest.model, result: correctedSections };
    },
  );

  return {
    correctedSections: result,
    log: {
      sectionIds: [...params.violation.sectionIds],
      reason: params.violation.detail,
      tokensSpent,
      clamped: reservation.clamped,
    },
  };
}
