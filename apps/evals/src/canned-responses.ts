import { createHash } from "node:crypto";

/**
 * One schema-valid NDJSON envelope line per PROTOCOLS.md §3 kind, plus a
 * canned response builder per agent type from them — the exact same shape
 * `apps/runtime/src/recipe-end-to-end.test.ts` (P10-T5) proved works
 * against every real `agent.md`'s actual instructed output kind
 * (reader/analyst/critic -> finding+note, writer -> section, coder ->
 * file_begin/chunk/end), always ending in `done` per rule 3 there. Kept as
 * its own small module in `@ao/evals` rather than imported from
 * `apps/runtime`'s test file — that file is a test, not a library export,
 * and duplicating ~30 lines of fixture glue here is cheaper than turning a
 * private test helper into a public cross-app dependency for it.
 *
 * P11-T2 parameterized both builders by a `scale`/`count` — T1's fixed
 * single-finding, 4-shard-item responses made every golden task produce
 * identical `tokensSpent` regardless of what its `tags`/`understanding`
 * claimed about size, which would have made "covers the large-input/
 * large-output scale" a label with no real effect on the run. Scaling the
 * actual generated NDJSON content (more findings/sections/file lines) and
 * the actual shard item count makes a "large" golden task genuinely spend
 * more tokens than a "small" one — a real, measurable difference, not a
 * decorated one.
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
  return JSON.stringify({
    t: "section",
    id,
    title: `סעיף ${id}`,
    body: `תוכן לדוגמה לבדיקת eval, סעיף ${id}. `.repeat(20),
  });
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

function repeat<T>(count: number, build: (index: number) => T): T[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => build(i + 1));
}

/**
 * A new agent type this doesn't cover fails loudly in `run-case.ts` with a
 * clear "no canned response for agentType" error rather than being
 * silently skipped — same design choice `recipe-end-to-end.test.ts` made
 * for its own `RESPONSES_BY_AGENT_TYPE`. `scale` is a small positive
 * integer (1 = T1's original single-item response); higher values repeat
 * more findings/sections or write a longer file, always ending in `done`.
 */
export function buildCannedResponse(agentType: string, scale: number): string | undefined {
  switch (agentType) {
    case "reader":
      return [...repeat(scale, (i) => findingLine(`f${String(i)}`)), doneLine()].join("\n");
    case "analyst":
      return [
        ...repeat(scale, (i) => findingLine(`a${String(i)}`)),
        noteLine("ניתוח לדוגמה"),
        doneLine(),
      ].join("\n");
    case "writer":
      return [...repeat(scale, (i) => sectionLine(`sec-${String(i)}`)), doneLine()].join("\n");
    case "critic":
      return [...repeat(scale, (i) => findingLine(`issue-${String(i)}`)), doneLine()].join("\n");
    case "coder": {
      const content = repeat(scale, (i) => `{"line": ${String(i)}, "ok": true}`).join("\n");
      return [...fileEnvelopeLines("w1", "out/result.json", content), doneLine()].join("\n");
    }
    default:
      return undefined;
  }
}

/**
 * Synthetic shard items every `shard`-mode stage in a golden task fans
 * out over — content doesn't matter for the mechanical assertions this
 * harness checks (P11-T2's content/quality grading is a separate, later
 * concern), only `count`, which drives how many items each shard task's
 * prompt lists (and therefore how many "input" tokens `MockLLMProvider`'s
 * length-based estimate reports for that stage).
 */
export function buildEvalShardItems(count: number): { id: string; path: string }[] {
  return repeat(count, (i) => ({ id: `f${String(i)}`, path: `src/file-${String(i)}.ts` }));
}
