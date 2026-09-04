import { parseNdjson } from "@ao/core";
import { describe, expect, it } from "vitest";
import { buildCannedResponse, buildEvalShardItems } from "./canned-responses.js";

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
