import { OutlineSchema, type OutlineSpec } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { attachOwnership, planSectionOwnership } from "./outline-shard.js";

const MIXED_OUTLINE: OutlineSpec = {
  id: "outline-1",
  sections: [
    {
      id: "sec-1",
      title: "Overview",
      goal: "explain",
      deliverableKind: "markdown",
      expectedOutputTokens: 4000,
    },
    {
      id: "sec-2",
      title: "src/a.ts",
      goal: "module a",
      deliverableKind: "files",
      path: "src/a.ts",
      expectedOutputTokens: 6000,
    },
    {
      id: "sec-3",
      title: "src/b.ts",
      goal: "module b",
      deliverableKind: "files",
      path: "src/b.ts",
      expectedOutputTokens: 6000,
    },
  ],
};

describe("planSectionOwnership", () => {
  it("assigns exactly one distinct owner per section — no section without an owner, no section with two owners", () => {
    const ownership = planSectionOwnership("stage-1", MIXED_OUTLINE);

    expect(ownership).toHaveLength(MIXED_OUTLINE.sections.length);
    const coveredSectionIds = new Set(ownership.map((o) => o.sectionId));
    expect(coveredSectionIds.size).toBe(MIXED_OUTLINE.sections.length);
    for (const section of MIXED_OUTLINE.sections) expect(coveredSectionIds.has(section.id)).toBe(true);

    const owners = new Set(ownership.map((o) => o.ownerTaskId));
    expect(owners.size).toBe(ownership.length); // every owner is a distinct task
  });

  it("ownerTaskId follows the same stageId#index convention as fanout.ts", () => {
    const ownership = planSectionOwnership("stage-9", MIXED_OUTLINE);
    for (const o of ownership) expect(o.ownerTaskId).toMatch(/^stage-9#\d+$/);
  });

  it("rejects (does not silently accept) an outline where two distinct sections claim the same file path — enforced at split time, not just documented", () => {
    const twoOwnersSamePath: OutlineSpec = {
      id: "outline-conflict",
      sections: [
        {
          id: "sec-a",
          title: "src/shared.ts (writer A)",
          goal: "first take",
          deliverableKind: "files",
          path: "src/shared.ts",
          expectedOutputTokens: 4000,
        },
        {
          id: "sec-b",
          title: "src/shared.ts (writer B)",
          goal: "second take",
          deliverableKind: "files",
          path: "src/shared.ts",
          expectedOutputTokens: 4000,
        },
      ],
    };

    expect(() => planSectionOwnership("stage-1", twoOwnersSamePath)).toThrow(/shared-file|shared.ts/);
  });

  it("a single-section outline still gets a single owner", () => {
    const single: OutlineSpec = {
      id: "outline-single",
      sections: [
        { id: "only", title: "Only", goal: "g", deliverableKind: "markdown", expectedOutputTokens: 1000 },
      ],
    };
    expect(planSectionOwnership("stage-1", single)).toEqual([
      { sectionId: "only", ownerTaskId: "stage-1#0" },
    ]);
  });
});

describe("attachOwnership", () => {
  it("produces a Blackboard-shaped Outline that round-trips through OutlineSchema", () => {
    const ownership = planSectionOwnership("stage-1", MIXED_OUTLINE);
    const outline = attachOwnership(MIXED_OUTLINE, ownership);

    expect(() => OutlineSchema.parse(outline)).not.toThrow();
    expect(outline.sections).toHaveLength(MIXED_OUTLINE.sections.length);
    for (const section of outline.sections) {
      expect(section.status).toBe("pending");
      expect(section.ownerTaskId).toMatch(/^stage-1#\d+$/);
    }
  });

  it("throws rather than silently skipping a section with no assigned owner", () => {
    const fullOwnership = planSectionOwnership("stage-1", MIXED_OUTLINE);
    const partialOwnership = fullOwnership.filter((o) => o.sectionId !== "sec-1"); // drop sec-1's owner
    expect(() => attachOwnership(MIXED_OUTLINE, partialOwnership)).toThrow(/sec-1/);
  });
});
