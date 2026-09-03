import { describe, expect, it } from "vitest";
import type { SectionResult } from "../reducers/local-reducers.js";
import { validateDocument } from "./document-validate.js";

function section(overrides: Partial<SectionResult> = {}): SectionResult {
  return { id: "sec-1", title: "Overview", body: "plain text, no headings, no links.", ...overrides };
}

describe("validateDocument", () => {
  it("passes a clean, well-formed document with zero violations", () => {
    const result = validateDocument([
      section({ id: "sec-1", title: "Overview", body: "### Details\n\nsome text" }),
      section({
        id: "sec-2",
        title: "Setup",
        body: "See [the overview](#overview) for context.",
      }),
    ]);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("flags a heading level skip within one section", () => {
    const result = validateDocument([
      section({ id: "sec-1", body: "# Top\n\n### Skipped straight to level 3" }),
    ]);
    expect(result.passed).toBe(false);
    const skip = result.violations.find((v) => v.kind === "heading-level-skip");
    expect(skip?.sectionIds).toEqual(["sec-1"]);
  });

  it("does not flag a legitimate step-by-step heading descent", () => {
    const result = validateDocument([section({ id: "sec-1", body: "# Top\n\n## Mid\n\n### Bottom" })]);
    expect(result.violations.filter((v) => v.kind === "heading-level-skip")).toHaveLength(0);
  });

  it("flags two sections that share the same title", () => {
    const result = validateDocument([
      section({ id: "sec-1", title: "Configuration" }),
      section({ id: "sec-2", title: "configuration" }), // case-insensitive match
    ]);
    const dup = result.violations.find((v) => v.kind === "duplicate-heading");
    expect(dup?.sectionIds).toEqual(["sec-1", "sec-2"]);
  });

  it("flags a cross-reference to an anchor that matches no section title", () => {
    const result = validateDocument([
      section({ id: "sec-1", title: "Overview", body: "See [setup](#setup) below." }),
    ]);
    const broken = result.violations.find((v) => v.kind === "broken-cross-reference");
    expect(broken?.sectionIds).toEqual(["sec-1"]);
    expect(broken?.detail).toContain("#setup");
  });

  it("does not flag a cross-reference whose anchor matches an existing section title", () => {
    const result = validateDocument([
      section({ id: "sec-1", title: "Overview", body: "See [setup](#setup-guide)." }),
      section({ id: "sec-2", title: "Setup Guide", body: "..." }),
    ]);
    expect(result.violations.filter((v) => v.kind === "broken-cross-reference")).toHaveLength(0);
  });

  it("flags inconsistent casing of the same technical term across sections", () => {
    const result = validateDocument([
      section({ id: "sec-1", title: "Overview", body: "We use GitHub for hosting." }),
      section({ id: "sec-2", title: "Setup", body: "Sign in to Github first." }),
    ]);
    const term = result.violations.find((v) => v.kind === "inconsistent-terminology");
    expect(term).toBeDefined();
    expect(term?.sectionIds.sort()).toEqual(["sec-1", "sec-2"]);
    expect(term?.detail).toContain("GitHub");
    expect(term?.detail).toContain("Github");
  });

  it("does not flag a term used with consistent casing throughout", () => {
    const result = validateDocument([
      section({ id: "sec-1", title: "Overview", body: "We use GitHub for hosting." }),
      section({ id: "sec-2", title: "Setup", body: "Sign in to GitHub first." }),
    ]);
    expect(result.violations.filter((v) => v.kind === "inconsistent-terminology")).toHaveLength(0);
  });

  it("does not flag ordinary sentence-initial capitalization as a term", () => {
    const result = validateDocument([
      section({ id: "sec-1", title: "Overview", body: "This is a sentence. this is another." }),
    ]);
    expect(result.violations.filter((v) => v.kind === "inconsistent-terminology")).toHaveLength(0);
  });
});
