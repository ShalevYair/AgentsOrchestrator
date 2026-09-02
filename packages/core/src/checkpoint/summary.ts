/**
 * P6-T2 — builds the ≤3K-token state summary PROTOCOLS.md §6 hands to the
 * `checkpoint` agent. `packages/core` has no tokenizer of its own (the same
 * boundary every other module in this package respects — `provider.countTokens()`
 * lives on `LLMProvider`, not here), so the cap is enforced with a
 * deliberately conservative local estimate rather than a real one:
 * `Math.ceil(length / 2)` assumes worse (denser) tokenization than even
 * P3-T9's own empirically-measured Hebrew ratio (~2.1 chars/token) — dense
 * enough that a real `countTokens()` call by a caller who wants to
 * double-check will always find *fewer* tokens than this function assumed,
 * never more. That asymmetry is what makes "never exceeds the cap" provable
 * without a real tokenizer in hand.
 */

import type { Gap } from "@ao/shared";
import type { CheckpointSignals } from "./signals.js";

export const DEFAULT_MAX_CHECKPOINT_SUMMARY_TOKENS = 3000;

/** Conservative chars-per-token divisor — see the file doc comment. */
const CONSERVATIVE_CHARS_PER_TOKEN = 2;

export function estimateTokensConservatively(text: string): number {
  return Math.ceil(text.length / CONSERVATIVE_CHARS_PER_TOKEN);
}

export interface CheckpointBudgetSnapshot {
  allocated: number;
  spent: number;
  committed: number;
  available: number;
}

export interface CheckpointTaskOutcomeCounts {
  success: number;
  failed: number;
  budgetRejected: number;
  cancelled: number;
}

export interface CheckpointStateSummaryInput {
  stageId: string;
  stageName: string;
  signals: CheckpointSignals;
  budget: CheckpointBudgetSnapshot;
  gaps: readonly Gap[];
  taskOutcomeCounts: CheckpointTaskOutcomeCounts;
  successCriteria: readonly string[];
  unmetCriteria: readonly string[];
}

export interface CheckpointStateSummary {
  text: string;
  estimatedTokens: number;
  /** True if any section had to be dropped/truncated to fit `maxTokens` — surfaced so a caller can log/flag a lossy summary rather than discovering it silently. */
  truncated: boolean;
}

function firedSignalNames(signals: CheckpointSignals): string[] {
  return (Object.keys(signals) as (keyof CheckpointSignals)[]).filter((key) => signals[key]);
}

function formatGapsSection(gaps: readonly Gap[], limit: number): string {
  if (gaps.length === 0) return "gaps: none";
  const shown = gaps.slice(0, limit);
  const lines = shown.map((g) => `- ${g.description} (${g.reason})`);
  const omitted = gaps.length - shown.length;
  if (omitted > 0) lines.push(`- (+${String(omitted)} more gap(s) omitted)`);
  return `gaps (${String(gaps.length)}):\n${lines.join("\n")}`;
}

function buildSections(input: CheckpointStateSummaryInput, gapsLimit: number): string[] {
  const fired = firedSignalNames(input.signals);
  return [
    `stage: ${input.stageId} (${input.stageName})`,
    `signals fired: ${fired.length > 0 ? fired.join(", ") : "none"}`,
    `budget: allocated=${String(input.budget.allocated)} spent=${String(input.budget.spent)} ` +
      `committed=${String(input.budget.committed)} available=${String(input.budget.available)}`,
    `tasks: success=${String(input.taskOutcomeCounts.success)} failed=${String(input.taskOutcomeCounts.failed)} ` +
      `budgetRejected=${String(input.taskOutcomeCounts.budgetRejected)} cancelled=${String(input.taskOutcomeCounts.cancelled)}`,
    `successCriteria: ${input.successCriteria.length > 0 ? input.successCriteria.join(" | ") : "none"}`,
    `unmetCriteria: ${input.unmetCriteria.length > 0 ? input.unmetCriteria.join(" | ") : "none"}`,
    formatGapsSection(input.gaps, gapsLimit),
  ];
}

/**
 * Builds the summary text, shrinking the `gaps` section first (the one
 * section whose length is unbounded input-side — everything else is O(1)
 * fields) and finally hard-truncating the whole string as an absolute
 * backstop, so the returned `estimatedTokens` can never exceed `maxTokens`
 * regardless of how large `input.gaps` is.
 */
export function buildCheckpointStateSummary(
  input: CheckpointStateSummaryInput,
  maxTokens: number = DEFAULT_MAX_CHECKPOINT_SUMMARY_TOKENS,
): CheckpointStateSummary {
  let gapsLimit = input.gaps.length;
  let text = buildSections(input, gapsLimit).join("\n");
  let truncated = false;

  while (estimateTokensConservatively(text) > maxTokens && gapsLimit > 0) {
    gapsLimit = Math.floor(gapsLimit / 2);
    text = buildSections(input, gapsLimit).join("\n");
    truncated = true;
  }

  const maxChars = maxTokens * CONSERVATIVE_CHARS_PER_TOKEN;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }

  return { text, estimatedTokens: estimateTokensConservatively(text), truncated };
}
