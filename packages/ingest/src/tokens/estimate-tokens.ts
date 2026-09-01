/**
 * Cheap, network-free token estimation for the planner and cost simulator
 * (BUDGET.md §4.4). Admission control never uses this — it always calls the
 * provider's real `countTokens`. This exists purely so the planner and dry
 * -run simulator can price a plan without spending a call.
 *
 * The chars/token ratios below were measured empirically against Gemini's
 * bundled offline tokenizer (`@google/genai/tokenizer`'s `LocalTokenizer`,
 * model `gemini-2.0-flash-001`) on representative English, Hebrew, code and
 * JSON samples — see `estimate-tokens.test.ts` for the corpus and the
 * accuracy check this is held to (<15% deviation, per P3-T9's done
 * criterion). They are not folklore defaults (e.g. the common "4 chars per
 * token" figure quoted for English/BPE tokenizers): Hebrew in particular
 * measured far denser (~2.1 chars/token) than English (~5.0), which matches
 * the well-known effect of BPE-family tokenizers under-representing scripts
 * that are a small share of training data.
 */
export type TokenKind = "code" | "json" | "hebrew" | "english" | "mixed";

const CHARS_PER_TOKEN: Record<Exclude<TokenKind, "mixed">, number> = {
  code: 3.2,
  json: 2.5,
  hebrew: 2.1,
  english: 5.0,
};

// Blended bucket for characters that are symbol/punctuation-heavy but whose
// surrounding kind isn't known (used by the "mixed"/auto-detect path).
const SYMBOL_CHARS_PER_TOKEN = 2.85;

// The non-Hebrew, non-symbol remainder of a "mixed" text is rarely pure
// prose — in practice it's markdown headers, identifiers and code words
// interleaved with prose, which tokenizes denser than the "english" kind's
// prose-only ratio. Measured separately against the same offline tokenizer
// on blended Markdown/Hebrew/code samples (see estimate-tokens.test.ts).
const MIXED_OTHER_CHARS_PER_TOKEN = 4.0;

const HEBREW_RANGE = /[֐-׿]/;
const SYMBOL_CHARS = new Set([..."{}[]()<>;:,.=+-*/\\\"'`|&^%$#@!~"]);

export function estimateTokens(text: string, kind: TokenKind = "mixed"): number {
  if (text.length === 0) return 0;
  if (kind !== "mixed") {
    return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN[kind]));
  }
  return Math.max(1, Math.ceil(estimateMixed(text)));
}

/**
 * Character-class weighted estimate for text of unknown/blended composition
 * (e.g. Hebrew prose with inline English identifiers and code fences).
 * Blends at the tokens-per-char rate (not the chars-per-token ratio) because
 * token counts are additive across the text while chars/token ratios are not.
 */
function estimateMixed(text: string): number {
  let hebrewChars = 0;
  let symbolChars = 0;
  let otherChars = 0;

  for (const ch of text) {
    if (HEBREW_RANGE.test(ch)) {
      hebrewChars++;
    } else if (SYMBOL_CHARS.has(ch)) {
      symbolChars++;
    } else {
      otherChars++;
    }
  }

  const tokens =
    hebrewChars / CHARS_PER_TOKEN.hebrew +
    symbolChars / SYMBOL_CHARS_PER_TOKEN +
    otherChars / MIXED_OTHER_CHARS_PER_TOKEN;

  return tokens;
}
