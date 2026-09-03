import type { OutlineSpec } from "@ao/shared";
import { describe, expect, it } from "vitest";
import type { AssembledFile } from "../parse/index.js";
import type { SectionResult } from "../reducers/local-reducers.js";
import type { TaskResult } from "../reducers/types.js";
import { planSectionOwnership } from "../sharding/outline-shard.js";
import { assembleOutline } from "./assembler.js";

const OUTLINE: OutlineSpec = {
  id: "outline-1",
  sections: [
    { id: "sec-1", title: "Intro", goal: "intro", deliverableKind: "markdown", expectedOutputTokens: 2000 },
    { id: "sec-2", title: "Body", goal: "body", deliverableKind: "markdown", expectedOutputTokens: 2000 },
    {
      id: "sec-3",
      title: "src/a.ts",
      goal: "module a",
      deliverableKind: "files",
      path: "src/a.ts",
      expectedOutputTokens: 4000,
    },
    {
      id: "sec-4",
      title: "src/b.ts",
      goal: "module b",
      deliverableKind: "files",
      path: "src/b.ts",
      expectedOutputTokens: 4000,
    },
  ],
};

function file(overrides: Partial<AssembledFile> = {}): AssembledFile {
  return {
    id: "w",
    path: "src/a.ts",
    op: "create",
    encoding: "utf8",
    data: "x",
    sha256: "a".repeat(64),
    lines: 1,
    ...overrides,
  };
}

const OWNERSHIP = planSectionOwnership("stage-1", OUTLINE);

function ownerOf(sectionId: string): string {
  return OWNERSHIP.find((o) => o.sectionId === sectionId)!.ownerTaskId;
}

describe("assembleOutline", () => {
  it("assembles a complete mixed outline with zero gaps and zero retry tasks", () => {
    const markdownInputs: TaskResult<SectionResult[]>[] = [
      { taskId: ownerOf("sec-2"), value: [{ id: "sec-2", title: "Body", body: "the body" }] },
      { taskId: ownerOf("sec-1"), value: [{ id: "sec-1", title: "Intro", body: "the intro" }] },
    ];
    const fileInputs: TaskResult<AssembledFile[]>[] = [
      { taskId: ownerOf("sec-3"), value: [file({ id: "a", path: "src/a.ts" })] },
      { taskId: ownerOf("sec-4"), value: [file({ id: "b", path: "src/b.ts" })] },
    ];

    const outcome = assembleOutline({
      stageId: "stage-1",
      outlineSpec: OUTLINE,
      ownership: OWNERSHIP,
      markdownInputs,
      fileInputs,
    });

    expect(outcome.markdown).toBe("## Intro\n\nthe intro\n\n## Body\n\nthe body");
    expect(outcome.files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(outcome.gaps).toHaveLength(0);
    expect(outcome.retryTasks).toHaveLength(0);
  });

  it("orders files by outline order regardless of arrival order", () => {
    const fileInputs: TaskResult<AssembledFile[]>[] = [
      { taskId: ownerOf("sec-4"), value: [file({ id: "b", path: "src/b.ts" })] },
      { taskId: ownerOf("sec-3"), value: [file({ id: "a", path: "src/a.ts" })] },
    ];
    const outcome = assembleOutline({
      stageId: "stage-1",
      outlineSpec: OUTLINE,
      ownership: OWNERSHIP,
      markdownInputs: [
        { taskId: ownerOf("sec-1"), value: [{ id: "sec-1", title: "Intro", body: "i" }] },
        { taskId: ownerOf("sec-2"), value: [{ id: "sec-2", title: "Body", body: "b" }] },
      ],
      fileInputs,
    });
    expect(outcome.files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("a missing markdown section produces a targeted retry task, not a whole-run failure", () => {
    const outcome = assembleOutline({
      stageId: "stage-1",
      outlineSpec: OUTLINE,
      ownership: OWNERSHIP,
      markdownInputs: [
        { taskId: ownerOf("sec-1"), value: [{ id: "sec-1", title: "Intro", body: "the intro" }] },
      ],
      fileInputs: [
        { taskId: ownerOf("sec-3"), value: [file({ id: "a", path: "src/a.ts" })] },
        { taskId: ownerOf("sec-4"), value: [file({ id: "b", path: "src/b.ts" })] },
      ],
    });

    expect(outcome.markdown).toContain("the intro");
    expect(outcome.retryTasks).toHaveLength(1);
    expect(outcome.retryTasks[0]).toEqual({
      taskId: `${ownerOf("sec-2")}#retry`,
      sectionId: "sec-2",
      title: "Body",
      goal: "body",
      deliverableKind: "markdown",
      expectedOutputTokens: 2000,
    });
    expect(outcome.gaps).toHaveLength(1);
    expect(outcome.gaps[0]?.description).toContain("sec-2");
  });

  it("a missing files section produces a targeted retry task carrying the original path", () => {
    const outcome = assembleOutline({
      stageId: "stage-1",
      outlineSpec: OUTLINE,
      ownership: OWNERSHIP,
      markdownInputs: [
        { taskId: ownerOf("sec-1"), value: [{ id: "sec-1", title: "Intro", body: "i" }] },
        { taskId: ownerOf("sec-2"), value: [{ id: "sec-2", title: "Body", body: "b" }] },
      ],
      fileInputs: [{ taskId: ownerOf("sec-3"), value: [file({ id: "a", path: "src/a.ts" })] }], // sec-4 missing
    });

    expect(outcome.files.map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(outcome.retryTasks).toHaveLength(1);
    expect(outcome.retryTasks[0]).toEqual({
      taskId: `${ownerOf("sec-4")}#retry`,
      sectionId: "sec-4",
      title: "src/b.ts",
      goal: "module b",
      deliverableKind: "files",
      path: "src/b.ts",
      expectedOutputTokens: 4000,
    });
  });

  it("every section missing still returns a best-effort outcome instead of throwing", () => {
    const outcome = assembleOutline({
      stageId: "stage-1",
      outlineSpec: OUTLINE,
      ownership: OWNERSHIP,
      markdownInputs: [],
      fileInputs: [],
    });
    expect(outcome.markdown).toBe("");
    expect(outcome.files).toHaveLength(0);
    expect(outcome.retryTasks).toHaveLength(4);
    expect(outcome.retryTasks.map((t) => t.sectionId).sort()).toEqual(["sec-1", "sec-2", "sec-3", "sec-4"]);
  });

  it("a file path collision is surfaced as a gap but does not produce a spurious retry task (it isn't a missing section)", () => {
    const fileInputs: TaskResult<AssembledFile[]>[] = [
      { taskId: ownerOf("sec-3"), value: [file({ id: "a1", path: "src/a.ts" })] },
      { taskId: "intruder#0", value: [file({ id: "a2", path: "src/a.ts" })] }, // same path, different task
      { taskId: ownerOf("sec-4"), value: [file({ id: "b", path: "src/b.ts" })] },
    ];
    const outcome = assembleOutline({
      stageId: "stage-1",
      outlineSpec: OUTLINE,
      ownership: OWNERSHIP,
      markdownInputs: [
        { taskId: ownerOf("sec-1"), value: [{ id: "sec-1", title: "Intro", body: "i" }] },
        { taskId: ownerOf("sec-2"), value: [{ id: "sec-2", title: "Body", body: "b" }] },
      ],
      fileInputs,
    });

    expect(outcome.retryTasks).toHaveLength(0); // sec-3's path *was* produced — not "missing"
    expect(outcome.gaps.some((g) => g.reason.includes("exclusive file ownership"))).toBe(true);
  });
});
