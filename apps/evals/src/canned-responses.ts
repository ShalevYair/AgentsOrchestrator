import { createHash } from "node:crypto";

/**
 * One schema-valid NDJSON envelope line per PROTOCOLS.md §3 kind, plus one
 * canned response text per agent type built from them — the exact same
 * shape `apps/runtime/src/recipe-end-to-end.test.ts` (P10-T5) proved works
 * against every real `agent.md`'s actual instructed output kind
 * (reader/analyst/critic -> finding+note, writer -> section, coder ->
 * file_begin/chunk/end), always ending in `done` per rule 3 there. Kept as
 * its own small module in `@ao/evals` rather than imported from
 * `apps/runtime`'s test file — that file is a test, not a library export,
 * and duplicating ~30 lines of fixture glue here is cheaper than turning a
 * private test helper into a public cross-app dependency for it.
 */

function findingLine(id: string): string {
  return JSON.stringify({
    t: "finding",
    id,
    claim: `ממצא ${id} לבדיקת eval`,
    tags: ["eval"],
    evidence: [{ artifact: "a1", loc: "src/x.ts:1-5" }],
    confidence: 0.8,
  });
}
function noteLine(text: string): string {
  return JSON.stringify({ t: "note", text });
}
function sectionLine(id: string): string {
  return JSON.stringify({ t: "section", id, title: `סעיף ${id}`, body: "תוכן לדוגמה לבדיקת eval." });
}
function fileEnvelopeLines(id: string, path: string, content: string): string[] {
  const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
  return [
    JSON.stringify({ t: "file_begin", id, path, op: "create", encoding: "utf8" }),
    JSON.stringify({ t: "file_chunk", id, seq: 0, data: content }),
    JSON.stringify({ t: "file_end", id, sha256, lines: content.split("\n").length }),
  ];
}
function doneLine(): string {
  return JSON.stringify({
    t: "done",
    summary: "הושלם",
    selfCheck: { criteriaMet: ["c1"], unmet: [], confidence: 0.9 },
  });
}

/**
 * A new agent type this map doesn't cover fails loudly in `run-case.ts`
 * with a clear "no canned response for agentType" error rather than being
 * silently skipped — same design choice `recipe-end-to-end.test.ts` made
 * for its own `RESPONSES_BY_AGENT_TYPE`.
 */
export const CANNED_RESPONSES_BY_AGENT_TYPE: Readonly<Record<string, string>> = {
  reader: [findingLine("f1"), findingLine("f2"), doneLine()].join("\n"),
  analyst: [findingLine("a1"), noteLine("ניתוח לדוגמה"), doneLine()].join("\n"),
  writer: [sectionLine("sec-1"), doneLine()].join("\n"),
  critic: [findingLine("issue-1"), doneLine()].join("\n"),
  coder: [...fileEnvelopeLines("w1", "out/result.json", '{"ok":true}'), doneLine()].join("\n"),
};

/** The fixed shard items every `shard`-mode stage in a golden task fans out over — content doesn't matter for the mechanical assertions this harness checks (P11-T2's content/quality grading is a separate, later concern). */
export const EVAL_SHARD_ITEMS = [
  { id: "f1", path: "src/a.ts" },
  { id: "f2", path: "src/b.ts" },
  { id: "f3", path: "src/c.ts" },
  { id: "f4", path: "src/d.ts" },
];
