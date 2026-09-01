import { describe, expect, it } from "vitest";
import { NdjsonEnvelopeSchema } from "./agent-output.js";

/** Every example line from PROTOCOLS.md §3, one JS object per NDJSON line. */
const EXAMPLE_LINES: unknown[] = [
  {
    t: "finding",
    id: "f1",
    claim: "...",
    tags: ["structure"],
    evidence: [{ artifact: "a12", loc: "src/x.ts:40-58" }],
    confidence: 0.82,
  },
  { t: "note", text: "הערה שלא נכנסת לתוצר" },
  { t: "need", what: "context", query: "מימוש AuthGuard", why: "הממצא לא ניתן לאימות בלי זה" },
  { t: "section", id: "sec-3", title: "...", body: "..." },
  { t: "file_begin", id: "w1", path: "src/a.ts", op: "create", encoding: "utf8" },
  { t: "file_chunk", id: "w1", seq: 0, data: "..." },
  {
    t: "file_end",
    id: "w1",
    sha256: "a".repeat(64),
    lines: 140,
  },
  {
    t: "done",
    summary: "...",
    selfCheck: { criteriaMet: ["c1"], unmet: [], confidence: 0.9 },
  },
];

describe("NdjsonEnvelopeSchema", () => {
  it.each(EXAMPLE_LINES.map((line) => [(line as { t: string }).t, line] as const))(
    "parses the %s line from PROTOCOLS.md §3 verbatim",
    (_t, line) => {
      expect(() => NdjsonEnvelopeSchema.parse(line)).not.toThrow();
    },
  );

  it("parses a tool_result line (PROTOCOLS.md §11)", () => {
    const line = {
      t: "tool_result",
      toolId: "count-symbols",
      ok: true,
      data: { count: 42 },
      truncated: false,
    };
    expect(NdjsonEnvelopeSchema.parse(line).t).toBe("tool_result");
  });

  it("rejects a line with an unrecognized `t`", () => {
    expect(() => NdjsonEnvelopeSchema.parse({ t: "unknown_thing" })).toThrow();
  });

  it("rejects a finding with confidence outside [0,1]", () => {
    expect(() =>
      NdjsonEnvelopeSchema.parse({
        t: "finding",
        id: "f1",
        claim: "x",
        tags: [],
        evidence: [],
        confidence: 1.5,
      }),
    ).toThrow();
  });

  it("rejects a file_end with a malformed sha256", () => {
    expect(() =>
      NdjsonEnvelopeSchema.parse({ t: "file_end", id: "w1", sha256: "not-a-hash", lines: 1 }),
    ).toThrow();
  });

  it("rejects a syntactically-parseable-JSON line that just isn't a valid envelope object (rule 1 territory)", () => {
    expect(() => NdjsonEnvelopeSchema.parse("just a string")).toThrow();
    expect(() => NdjsonEnvelopeSchema.parse(null)).toThrow();
  });
});
