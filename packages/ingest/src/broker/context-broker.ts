import { estimateTokens, type TokenKind } from "../tokens/estimate-tokens.js";

/**
 * Priority tiers match ARCHITECTURE.md §5.3's fill order exactly (1 =
 * filled first): Contract Block, the Task's own shard, retrieved R2/R3
 * evidence, prior Blackboard findings, background evidence last.
 */
export type ContextPriority = 1 | 2 | 3 | 4 | 5;

export interface ContextItem {
  id: string;
  priority: ContextPriority;
  text: string;
  /** Precomputed token count, if the caller already has one (e.g. from a
   * cached chunk). Falls back to `estimateTokens(text, kind)` — this is
   * planning-time selection, not admission control, so an estimate is
   * fine here (real admission still goes through the provider's
   * `countTokens`, per BUDGET.md §4.4). */
  tokens?: number;
  kind?: TokenKind;
}

export interface CutItem {
  id: string;
  priority: ContextPriority;
  tokens: number;
  reason: "over-budget";
}

export interface ContextSelection {
  included: ContextItem[];
  cut: CutItem[];
  totalTokens: number;
  budget: number;
}

/**
 * Fills `budget` with `items` in ARCHITECTURE.md §5.3 priority order
 * (lower `priority` number first; original relative order preserved within
 * a tier), skipping — not aborting on — any single item that wouldn't fit,
 * so a large item early in a tier can't block smaller, lower-priority
 * items from still being included. `included` never exceeds `budget`
 * (P3-T8's own property test asserts this over many random inputs); every
 * excluded item is reported in `cut` with why.
 */
export function selectContext(items: ContextItem[], budget: number): ContextSelection {
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.priority - b.item.priority || a.index - b.index);

  const included: ContextItem[] = [];
  const cut: CutItem[] = [];
  let totalTokens = 0;

  for (const { item } of ordered) {
    const tokens = item.tokens ?? estimateTokens(item.text, item.kind ?? "mixed");
    if (totalTokens + tokens <= budget) {
      included.push(item);
      totalTokens += tokens;
    } else {
      cut.push({ id: item.id, priority: item.priority, tokens, reason: "over-budget" });
    }
  }

  return { included, cut, totalTokens, budget };
}
