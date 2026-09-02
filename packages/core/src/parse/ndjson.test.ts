import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseNdjson, VIOLATION_RATIO_THRESHOLD } from "./ndjson.js";

function sha256(data: string, encoding: "utf8" | "base64" = "utf8"): string {
  return createHash("sha256")
    .update(encoding === "base64" ? Buffer.from(data, "base64") : Buffer.from(data, "utf8"))
    .digest("hex");
}

function line(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

describe("rule 1 — invalid lines are dropped and counted", () => {
  it("counts a line that isn't JSON at all", () => {
    const text = line({ t: "note", text: "ok" }) + "not json at all\n";
    const result = parseNdjson(text);
    expect(result.envelopes).toHaveLength(1);
    expect(result.schemaViolations).toBe(1);
    expect(result.totalLines).toBe(2);
  });

  it("counts JSON that doesn't match any envelope variant", () => {
    const text = line({ t: "unknown-type", x: 1 }) + line({ notEvenATypeField: true });
    const result = parseNdjson(text);
    expect(result.envelopes).toHaveLength(0);
    expect(result.schemaViolations).toBe(2);
  });
});

describe("rule 2 — a partial trailing line is dropped silently", () => {
  it("drops an unterminated final line without counting it as a violation", () => {
    const good = line({ t: "note", text: "first" });
    const truncated = '{"t":"section","id":"sec-8","title":"net';
    const result = parseNdjson(good + truncated);
    expect(result.envelopes).toHaveLength(1);
    expect(result.schemaViolations).toBe(0);
    expect(result.totalLines).toBe(1); // the truncated tail never enters the denominator
  });

  it("keeps a final line that happens to be valid JSON even without a trailing newline", () => {
    const text = line({ t: "note", text: "first" }) + JSON.stringify({ t: "note", text: "second" });
    const result = parseNdjson(text);
    expect(result.envelopes).toHaveLength(2);
    expect(result.schemaViolations).toBe(0);
  });

  it("treats a text ending in a real newline as having no trailing partial at all", () => {
    const text = line({ t: "note", text: "only" });
    const result = parseNdjson(text);
    expect(result.envelopes).toHaveLength(1);
    expect(result.totalLines).toBe(1);
  });
});

describe("rule 3 — completion is reported, not enforced by the parser", () => {
  it("reports done:false and no doneEnvelope when the stream never sent one", () => {
    const result = parseNdjson(line({ t: "note", text: "x" }));
    expect(result.done).toBe(false);
    expect(result.doneEnvelope).toBeUndefined();
  });

  it("reports done:true and captures the envelope when it is present", () => {
    const doneLine = {
      t: "done" as const,
      summary: "ok",
      selfCheck: { criteriaMet: ["c1"], unmet: [], confidence: 0.9 },
    };
    const result = parseNdjson(line(doneLine));
    expect(result.done).toBe(true);
    expect(result.doneEnvelope).toEqual(doneLine);
  });
});

describe("rule 4 — file_chunk/file_begin/file_end coordination", () => {
  it("drops an orphaned file_chunk with no matching file_begin", () => {
    const result = parseNdjson(line({ t: "file_chunk", id: "w1", seq: 0, data: "x" }));
    expect(result.orphanedChunkCount).toBe(1);
    expect(result.schemaViolations).toBe(0); // schema-valid line, just orphaned
    expect(result.files).toHaveLength(0);
  });

  it("marks a file_begin with no file_end as partial and never writes it", () => {
    const text = line({ t: "file_begin", id: "w1", path: "src/a.ts", op: "create", encoding: "utf8" });
    const result = parseNdjson(text);
    expect(result.files).toHaveLength(0);
    expect(result.partialFiles).toEqual([{ id: "w1", path: "src/a.ts", reason: "missing-file-end" }]);
  });
});

describe("rule 5 — sha256 mismatch rejects the assembled file", () => {
  it("assembles a file whose chunks reduce to the declared sha256", () => {
    const data = "hello world";
    const text =
      line({ t: "file_begin", id: "w1", path: "src/a.ts", op: "create", encoding: "utf8" }) +
      line({ t: "file_chunk", id: "w1", seq: 0, data: "hello " }) +
      line({ t: "file_chunk", id: "w1", seq: 1, data: "world" }) +
      line({ t: "file_end", id: "w1", sha256: sha256(data), lines: 1 });
    const result = parseNdjson(text);
    expect(result.partialFiles).toHaveLength(0);
    expect(result.files).toEqual([
      { id: "w1", path: "src/a.ts", op: "create", encoding: "utf8", data, sha256: sha256(data), lines: 1 },
    ]);
  });

  it("reorders out-of-order chunks by seq before hashing", () => {
    const data = "hello world";
    const text =
      line({ t: "file_begin", id: "w1", path: "src/a.ts", op: "create", encoding: "utf8" }) +
      line({ t: "file_chunk", id: "w1", seq: 1, data: "world" }) +
      line({ t: "file_chunk", id: "w1", seq: 0, data: "hello " }) +
      line({ t: "file_end", id: "w1", sha256: sha256(data), lines: 1 });
    const result = parseNdjson(text);
    expect(result.files[0]?.data).toBe(data);
  });

  it("rejects a file whose reassembled content doesn't match the declared sha256", () => {
    const text =
      line({ t: "file_begin", id: "w1", path: "src/a.ts", op: "create", encoding: "utf8" }) +
      line({ t: "file_chunk", id: "w1", seq: 0, data: "hello" }) +
      line({ t: "file_end", id: "w1", sha256: sha256("this does not match"), lines: 1 });
    const result = parseNdjson(text);
    expect(result.files).toHaveLength(0);
    expect(result.partialFiles).toHaveLength(1);
    expect(result.partialFiles[0]?.reason).toBe("sha256-mismatch");
    expect(result.partialFiles[0]?.computedSha256).toBe(sha256("hello"));
  });
});

describe("rule 6 — violation ratio threshold", () => {
  it("flags when schemaViolations/totalLines exceeds 0.15", () => {
    const goodLines = Array.from({ length: 8 }, (_, i) => line({ t: "note", text: `n${String(i)}` })).join(
      "",
    );
    const badLines = Array.from({ length: 2 }, () => "garbage\n").join(""); // 2/10 = 0.2 > 0.15
    const result = parseNdjson(goodLines + badLines);
    expect(result.totalLines).toBe(10);
    expect(result.schemaViolations).toBe(2);
    expect(result.violationRatioExceeded).toBe(true);
  });

  it("does not flag exactly at or under the threshold", () => {
    // 1/7 ≈ 0.1428... which is under 0.15
    const goodLines = Array.from({ length: 6 }, (_, i) => line({ t: "note", text: `n${String(i)}` })).join(
      "",
    );
    const result = parseNdjson(goodLines + "garbage\n");
    expect(result.schemaViolations / result.totalLines).toBeLessThan(VIOLATION_RATIO_THRESHOLD);
    expect(result.violationRatioExceeded).toBe(false);
  });

  it("never flags an empty stream", () => {
    expect(parseNdjson("").violationRatioExceeded).toBe(false);
  });
});

describe("lastCompleteEnvelope", () => {
  it("tracks the last envelope that parsed successfully, ignoring a trailing truncated line", () => {
    const text =
      line({ t: "section", id: "sec-7", title: "a", body: "b" }) + '{"t":"section","id":"sec-8","title":"net'; // truncated
    const result = parseNdjson(text);
    expect(result.lastCompleteEnvelope).toEqual({ t: "section", id: "sec-7", title: "a", body: "b" });
  });

  it("is undefined when nothing parsed", () => {
    expect(parseNdjson("garbage\n").lastCompleteEnvelope).toBeUndefined();
  });
});

describe("fuzz — truncation at every byte offset never crashes the parser", () => {
  it("handles every possible prefix of a realistic multi-envelope stream", () => {
    const data = "console.log('hi');";
    const fullStream =
      line({ t: "finding", id: "f1", claim: "x", tags: [], evidence: [], confidence: 0.5 }) +
      line({ t: "note", text: "hello" }) +
      line({ t: "need", what: "context", query: "q", why: "w" }) +
      line({ t: "section", id: "sec-1", title: "t", body: "b" }) +
      line({ t: "file_begin", id: "w1", path: "a.ts", op: "create", encoding: "utf8" }) +
      line({ t: "file_chunk", id: "w1", seq: 0, data }) +
      line({ t: "file_end", id: "w1", sha256: sha256(data), lines: 1 }) +
      line({ t: "tool_result", toolId: "count", ok: true, data: { n: 1 }, truncated: false }) +
      line({ t: "done", summary: "done", selfCheck: { criteriaMet: [], unmet: [], confidence: 1 } });

    for (let i = 0; i <= fullStream.length; i++) {
      const prefix = fullStream.slice(0, i);
      expect(() => parseNdjson(prefix)).not.toThrow();
      const result = parseNdjson(prefix);
      expect(result.totalLines).toBeGreaterThanOrEqual(0);
      expect(result.schemaViolations).toBeGreaterThanOrEqual(0);
      expect(result.schemaViolations).toBeLessThanOrEqual(result.totalLines);
    }

    // And the untruncated stream itself parses cleanly end to end.
    const full = parseNdjson(fullStream);
    expect(full.done).toBe(true);
    expect(full.files).toHaveLength(1);
    expect(full.schemaViolations).toBe(0);
  });

  it("never crashes on adversarial random byte strings", () => {
    // Deterministic seeded LCG — no new dependency, matches this repo's
    // existing property-test convention (packages/ingest's ContextBroker
    // test uses the same hand-rolled-loop style rather than a fuzz library).
    let seed = 42;
    function nextRandom(): number {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    const alphabet = '{}[]":,truefalsenilbo0123456789\n abcXYZ_-.';
    for (let trial = 0; trial < 300; trial++) {
      const length = Math.floor(nextRandom() * 200);
      let text = "";
      for (let i = 0; i < length; i++) {
        text += alphabet[Math.floor(nextRandom() * alphabet.length)];
      }
      expect(() => parseNdjson(text)).not.toThrow();
    }
  });
});
