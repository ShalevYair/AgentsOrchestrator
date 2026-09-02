import type { FinishReason, GenerateRequest, LLMProvider, Message, Usage } from "@ao/shared";
import { runAdmitted, type BudgetBucketId, type Ledger } from "../ledger/index.js";
import { parseNdjson, type NdjsonParseResult } from "../parse/index.js";

/** PROTOCOLS.md §5: "עד 3 המשכות ל-Task". */
export const MAX_CONTINUATIONS = 3;

/**
 * BUDGET.md §3's bucket table names continuations explicitly under
 * "Repair — ניסיונות חוזרים, המשכות, תיקוני כשל" — distinct from the
 * originating stage's own `execution` spend, so a run's report can show
 * continuation overhead separately from first-attempt work.
 */
const DEFAULT_CONTINUATION_BUCKET: BudgetBucketId = "repair";

export interface CollectedGenerate {
  text: string;
  usage: Usage;
  finishReason: FinishReason;
}

/** Drains an `LLMProvider.generate()` stream into one accumulated result — thinking deltas are excluded from `text`, matching what the NDJSON parser (P5-T7) expects to see. */
export async function collectGenerate(
  provider: LLMProvider,
  request: GenerateRequest,
): Promise<CollectedGenerate> {
  let text = "";
  let usage: Usage | undefined;
  let finishReason: FinishReason = "other";
  for await (const delta of provider.generate(request)) {
    if (!delta.isThought) text += delta.text;
    if (delta.usage) usage = delta.usage;
    if (delta.finishReason) finishReason = delta.finishReason;
  }
  return {
    text,
    usage: usage ?? { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, cachedTokens: 0 },
    finishReason,
  };
}

/** PROTOCOLS.md §5: continuation only ever triggers on an unfinished response that was cut off by the output cap — any other unfinished reason (safety, other) is a different failure mode (ARCHITECTURE.md §10's call-level retry), not this protocol. */
export function needsContinuation(parsed: NdjsonParseResult, finishReason: FinishReason): boolean {
  return !parsed.done && finishReason === "max_tokens";
}

/**
 * PROTOCOLS.md §5: "אין התקדמות (אותו lastComplete) → כישלון". Two parses
 * have made no progress when their `lastCompleteEnvelope` anchors are
 * identical (including both being `undefined`, i.e. neither attempt
 * completed even one envelope). Envelopes are plain JSON-serializable
 * objects coming out of the same schema, so a stringify comparison is a
 * safe, order-stable deep-equality check here.
 */
export function hasProgressed(previous: NdjsonParseResult, next: NdjsonParseResult): boolean {
  return JSON.stringify(previous.lastCompleteEnvelope) !== JSON.stringify(next.lastCompleteEnvelope);
}

/** PROTOCOLS.md §5's worked example, generalized: names the last complete envelope and instructs the model not to repeat it. */
export function buildContinuationPrompt(parsed: NdjsonParseResult): string {
  const anchor = parsed.lastCompleteEnvelope;
  const anchorId = anchor && "id" in anchor ? anchor.id : undefined;
  const anchorDescription = anchorId ? `"${anchorId}"` : "מה שכבר נשלח";
  return (
    `השלמת מעטפת אחרונה: ${anchorDescription}. ` +
    "המשך מהמעטפה הבאה בלבד. אל תחזור על מעטפות שכבר נשלחו, ואל תשלח שוב את אותה מעטפה."
  );
}

export interface ContinuationAttempt {
  /** 1-based — the Nth continuation call for this Task. */
  attemptNumber: number;
  text: string;
  usage: Usage;
  finishReason: FinishReason;
  parsed: NdjsonParseResult;
  progressed: boolean;
}

export type ContinuationOutcome =
  "already-complete" | "not-truncated" | "completed" | "no-progress" | "max-continuations-exceeded";

export interface ContinuationResult {
  finalText: string;
  parsed: NdjsonParseResult;
  attempts: ContinuationAttempt[];
  outcome: ContinuationOutcome;
}

export interface RunWithContinuationParams {
  ledger: Ledger;
  provider: LLMProvider;
  stageId: string;
  agentType?: string;
  bucket?: BudgetBucketId;
  /** The base request used to build each continuation call — `contents` holds the original conversation; this function appends the model's own accumulated output plus a fresh continuation instruction turn for each attempt. */
  baseRequest: GenerateRequest;
  /** The already-collected text and finish reason of the *first* (non-continuation) call — this function only ever handles resuming from there onward. */
  initialText: string;
  initialFinishReason: FinishReason;
  /** BUDGET.md §5, admission's `worstCase` — continuation calls reuse the same cached Contract Block (PROTOCOLS.md §5: "מהמטמון, זול"), so a single caller-supplied estimate covers every attempt rather than re-deriving one per call. */
  worstCasePerContinuation: number;
  maxContinuations?: number;
}

/**
 * P5-T8 — drives PROTOCOLS.md §5's continuation protocol to completion (or
 * to one of its defined stopping conditions), routing every continuation
 * call through `runAdmitted` so each one is fully counted in the `Ledger`
 * (BUDGET.md §2: "כל ניסיון חוזר והמשכות" is spent, never free).
 */
export async function runWithContinuation(params: RunWithContinuationParams): Promise<ContinuationResult> {
  const maxContinuations = params.maxContinuations ?? MAX_CONTINUATIONS;
  const bucket = params.bucket ?? DEFAULT_CONTINUATION_BUCKET;

  let accumulatedText = params.initialText;
  const parsed = parseNdjson(accumulatedText);
  const attempts: ContinuationAttempt[] = [];

  if (parsed.done) {
    return { finalText: accumulatedText, parsed, attempts, outcome: "already-complete" };
  }
  if (!needsContinuation(parsed, params.initialFinishReason)) {
    return { finalText: accumulatedText, parsed, attempts, outcome: "not-truncated" };
  }

  let previousParsed = parsed;

  for (let attemptNumber = 1; attemptNumber <= maxContinuations; attemptNumber++) {
    const continuationTurns: Message[] = [
      { role: "model", parts: [{ text: accumulatedText }] },
      { role: "user", parts: [{ text: buildContinuationPrompt(previousParsed) }] },
    ];
    const request: GenerateRequest = {
      ...params.baseRequest,
      contents: [...params.baseRequest.contents, ...continuationTurns],
    };

    const collected = await runAdmitted(
      params.ledger,
      {
        bucket,
        stageId: params.stageId,
        ...(params.agentType !== undefined ? { agentType: params.agentType } : {}),
        worstCase: params.worstCasePerContinuation,
      },
      async () => {
        const result = await collectGenerate(params.provider, request);
        return { usage: result.usage, modelId: request.model, result };
      },
    );

    accumulatedText += collected.text;
    const nextParsed = parseNdjson(accumulatedText);
    const progressed = hasProgressed(previousParsed, nextParsed);
    attempts.push({
      attemptNumber,
      text: collected.text,
      usage: collected.usage,
      finishReason: collected.finishReason,
      parsed: nextParsed,
      progressed,
    });

    if (nextParsed.done) {
      return { finalText: accumulatedText, parsed: nextParsed, attempts, outcome: "completed" };
    }
    if (!progressed) {
      return { finalText: accumulatedText, parsed: nextParsed, attempts, outcome: "no-progress" };
    }

    previousParsed = nextParsed;
    if (!needsContinuation(nextParsed, collected.finishReason)) {
      // Still not done, but no longer cut off by the output cap (e.g. a
      // safety stop mid-continuation) — outside this protocol's remit.
      return { finalText: accumulatedText, parsed: nextParsed, attempts, outcome: "not-truncated" };
    }
  }

  return {
    finalText: accumulatedText,
    parsed: previousParsed,
    attempts,
    outcome: "max-continuations-exceeded",
  };
}
