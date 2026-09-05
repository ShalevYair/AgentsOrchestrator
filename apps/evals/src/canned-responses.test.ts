import { parseNdjson } from "@ao/core";
import { describe, expect, it } from "vitest";
import { buildCannedResponse, buildEvalShardItems, splitForContinuation } from "./canned-responses.js";

const AGENT_TYPES = ["reader", "analyst", "writer", "critic", "coder"];

describe("buildCannedResponse", () => {
  it("returns undefined for an agentType with no canned response", () => {
    expect(buildCannedResponse("synthesizer", 1)).toBeUndefined();
  });

  it.each(AGENT_TYPES)("produces schema-valid NDJSON with zero violations for %s at scale 1", (agentType) => {
    const text = buildCannedResponse(agentType, 1);
    expect(text).toBeDefined();
    const parsed = parseNdjson(text ?? "");
    expect(parsed.schemaViolations).toBe(0);
    expect(parsed.done).toBe(true);
  });

  it.each(AGENT_TYPES)(
    "stays schema-valid at a larger scale for %s, and produces strictly more output",
    (agentType) => {
      const small = buildCannedResponse(agentType, 1) ?? "";
      const large = buildCannedResponse(agentType, 9) ?? "";
      const parsedLarge = parseNdjson(large);

      expect(parsedLarge.schemaViolations).toBe(0);
      expect(parsedLarge.done).toBe(true);
      expect(large.length).toBeGreaterThan(small.length);
    },
  );

  it("always ends with a done envelope regardless of scale", () => {
    for (const scale of [1, 3, 9]) {
      const text = buildCannedResponse("reader", scale) ?? "";
      const lastLine = text.trim().split("\n").at(-1);
      expect(JSON.parse(lastLine ?? "{}")).toMatchObject({ t: "done" });
    }
  });
});

describe("splitForContinuation", () => {
  it("splits a multi-line response into two non-empty halves whose concatenation reparses identically", () => {
    const full = buildCannedResponse("writer", 9) ?? "";
    const { initialText, continuationText } = splitForContinuation(full);

    expect(initialText.length).toBeGreaterThan(0);
    expect(continuationText.length).toBeGreaterThan(0);
    const reparsed = parseNdjson(initialText + continuationText);
    const original = parseNdjson(full);
    expect(reparsed.schemaViolations).toBe(0);
    expect(reparsed.envelopes).toEqual(original.envelopes);
  });

  it("the initial half is never done and the continuation half completes it", () => {
    const full = buildCannedResponse("coder", 9) ?? "";
    const { initialText, continuationText } = splitForContinuation(full);

    expect(parseNdjson(initialText).done).toBe(false);
    expect(parseNdjson(initialText + continuationText).done).toBe(true);
  });

  it("keeps the done line in the continuation half even for a minimal 2-line response", () => {
    const full = buildCannedResponse("reader", 1) ?? "";
    const { initialText, continuationText } = splitForContinuation(full);

    expect(parseNdjson(initialText + continuationText).done).toBe(true);
    expect(continuationText).toContain('"t":"done"');
  });
});

describe("buildEvalShardItems", () => {
  it("produces exactly `count` items with unique ids and paths", () => {
    const items = buildEvalShardItems(40);
    expect(items).toHaveLength(40);
    expect(new Set(items.map((i) => i.id)).size).toBe(40);
    expect(new Set(items.map((i) => i.path)).size).toBe(40);
  });

  it("clamps a count below 1 up to 1 item", () => {
    expect(buildEvalShardItems(0)).toHaveLength(1);
  });
});
