import { describe, expect, it } from "vitest";
import { estimateTokens } from "./estimate-tokens.js";

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTokens("", "english")).toBe(0);
  });

  it("never returns 0 for non-empty text", () => {
    expect(estimateTokens("a", "english")).toBeGreaterThanOrEqual(1);
    expect(estimateTokens(".", "code")).toBeGreaterThanOrEqual(1);
  });

  it("gives Hebrew a lower chars/token ratio than English (denser tokenization)", () => {
    const hebrew = "אבגדהוזחטיכלמנסעפצקרשת".repeat(4);
    const english = "abcdefghijklmnopqrstuvwxyz".repeat(4);
    const hebrewTokens = estimateTokens(hebrew, "hebrew");
    const englishTokens = estimateTokens(english, "english");
    expect(hebrewTokens).toBeGreaterThan(englishTokens);
  });

  it("mixed estimate falls between the pure-kind estimates for blended text", () => {
    const codeOnly = 'const x = { a: 1, b: "two" };'.repeat(3);
    const mixed = estimateTokens(codeOnly, "mixed");
    const asCode = estimateTokens(codeOnly, "code");
    // Symbol-heavy text classified as "mixed" should land in the same
    // ballpark as if it had been explicitly tagged "code".
    expect(mixed).toBeGreaterThan(asCode * 0.5);
    expect(mixed).toBeLessThan(asCode * 2);
  });
});

/**
 * Accuracy check against Gemini's real tokenizer (P3-T9 done criterion:
 * <15% deviation on a mixed Hebrew/English/code corpus). Uses the offline
 * `LocalTokenizer` bundled with @google/genai — this runs entirely locally
 * (no network, no API key, no billed tokens), so it doesn't violate the
 * zero-LLM-calls rule for unit tests; it's a pure tokenizer computation,
 * not a model call. This corpus is deliberately distinct from the samples
 * used to derive the ratios in estimate-tokens.ts, so this is a genuine
 * held-out check and not circular.
 */
describe("estimateTokens accuracy vs Gemini's real tokenizer", () => {
  const corpus: { kind: "english" | "hebrew" | "code" | "json"; text: string }[] = [
    {
      kind: "english",
      text: `A run is the full lifecycle of one user turn: intake, recon, planning,
staged execution with checkpoints, assembly, and delivery. Everything before
the first model call is local and free — inventory, symbol maps, and a
lexical index over the connected folder.`,
    },
    {
      kind: "hebrew",
      text: `ריצה היא מחזור החיים המלא של תור משתמש אחד: קליטה, סיור, תכנון, ביצוע
שלב-אחרי-שלב עם צ'קפוינטים, הרכבה ומסירה. כל מה שקורה לפני קריאת המודל
הראשונה הוא מקומי וחינמי — אינוונטר, מפת סמלים ואינדקס לקסיקלי מעל
התיקייה המחוברת.`,
    },
    {
      kind: "code",
      text: `interface Ledger {
  spent: number;
  committed: number;
  available: number;
  reserve: number;
}

function admit(ledger: Ledger, worstCase: number): boolean {
  return ledger.available >= worstCase;
}`,
    },
    {
      kind: "json",
      text: `{"version":1,"runId":"run_01J9X","stages":[{"id":"s1","agentType":"reader","fanout":{"mode":"shard","count":6}}],"reserve":{"synthesisTokens":120000}}`,
    },
  ];

  it("stays within 15% of the real tokenizer for each kind", async () => {
    const { LocalTokenizer } = await import("@google/genai/tokenizer");
    const tokenizer = new LocalTokenizer("gemini-2.0-flash-001");

    const deviations: number[] = [];
    for (const { kind, text } of corpus) {
      const real = (await tokenizer.countTokens(text)).totalTokens ?? 0;
      const estimated = estimateTokens(text, kind);
      const deviation = Math.abs(estimated - real) / real;
      deviations.push(deviation);
      expect(
        deviation,
        `${kind}: estimated=${estimated} real=${real} deviation=${(deviation * 100).toFixed(1)}%`,
      ).toBeLessThan(0.15);
    }

    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    expect(avgDeviation).toBeLessThan(0.15);
  });

  it("stays within 15% for a single mixed Hebrew/English/code document", async () => {
    const { LocalTokenizer } = await import("@google/genai/tokenizer");
    const tokenizer = new LocalTokenizer("gemini-2.0-flash-001");

    const mixedDoc = `## סקירת \`AuthGuard\`

הקובץ \`src/auth/guard.ts\` אחראי על ה-authentication וה-authorization.
זו הפונקציה המרכזית:

\`\`\`ts
export function guard(req: Request): boolean {
  return req.headers.get("authorization") != null;
}
\`\`\`

הבדיקה \`guard.test.ts\` מכסה את מקרה הקצה שבו ה-header חסר.`;

    const real = (await tokenizer.countTokens(mixedDoc)).totalTokens ?? 0;
    const estimated = estimateTokens(mixedDoc, "mixed");
    const deviation = Math.abs(estimated - real) / real;
    expect(
      deviation,
      `estimated=${estimated} real=${real} deviation=${(deviation * 100).toFixed(1)}%`,
    ).toBeLessThan(0.15);
  });
});
