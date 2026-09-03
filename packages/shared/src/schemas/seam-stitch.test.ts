import { describe, expect, it } from "vitest";
import { SeamStitchResponseSchema } from "./seam-stitch.js";

describe("SeamStitchResponseSchema", () => {
  it("parses a single corrected section", () => {
    const parsed = SeamStitchResponseSchema.parse({
      sections: [{ id: "sec-2", correctedBody: "fixed text" }],
    });
    expect(parsed.sections).toHaveLength(1);
  });

  it("rejects an empty sections array", () => {
    expect(() => SeamStitchResponseSchema.parse({ sections: [] })).toThrow();
  });

  it("rejects a section missing correctedBody", () => {
    expect(() => SeamStitchResponseSchema.parse({ sections: [{ id: "sec-2" }] })).toThrow();
  });
});
