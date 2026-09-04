import { parseNdjson } from "@ao/core";
import { describe, expect, it } from "vitest";
import { extractDeliverableText } from "./deliverable-text.js";

function ndjson(...lines: object[]): string {
  return lines.map((l) => JSON.stringify(l)).join("\n");
}

describe("extractDeliverableText", () => {
  it("extracts finding claims, note text, and section bodies", () => {
    const parsed = parseNdjson(
      ndjson(
        { t: "finding", id: "f1", claim: "claim text", tags: [], evidence: [], confidence: 0.9 },
        { t: "note", text: "note text" },
        { t: "section", id: "s1", title: "title text", body: "body text" },
        { t: "done", summary: "done", selfCheck: { criteriaMet: [], unmet: [], confidence: 1 } },
      ),
    );
    const text = extractDeliverableText([parsed]);
    expect(text).toContain("claim text");
    expect(text).toContain("note text");
    expect(text).toContain("title text");
    expect(text).toContain("body text");
  });

  it("extracts assembled file content, not raw file_chunk envelopes", () => {
    const parsed = parseNdjson(
      ndjson(
        { t: "file_begin", id: "w1", path: "out.json", op: "create", encoding: "utf8" },
        { t: "file_chunk", id: "w1", seq: 0, data: '{"ok":true}' },
        {
          t: "file_end",
          id: "w1",
          sha256: "4062edaf750fb8074e7e83e0c9028c94e32468a8b6f1614774328ef045150f93",
          lines: 1,
        },
      ),
    );
    expect(parsed.files).toHaveLength(1);
    const text = extractDeliverableText([parsed]);
    expect(text).toContain('{"ok":true}');
  });

  it("concatenates across multiple parsed results, in order", () => {
    const a = parseNdjson(ndjson({ t: "note", text: "first" }));
    const b = parseNdjson(ndjson({ t: "note", text: "second" }));
    const text = extractDeliverableText([a, b]);
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
  });

  it("returns an empty string for no results", () => {
    expect(extractDeliverableText([])).toBe("");
  });
});
