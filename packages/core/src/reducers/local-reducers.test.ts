import type { Finding, Outline } from "@ao/shared";
import { describe, expect, it } from "vitest";
import type { AssembledFile } from "../parse/index.js";
import { assembleFiles, concatOrdered, dedupeFindings, vote, type SectionResult } from "./local-reducers.js";
import type { TaskResult } from "./types.js";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    stageId: "s1",
    claim: "AuthGuard validates JWT tokens",
    tags: ["auth"],
    evidence: [{ artifact: "a1", loc: "src/auth.ts:10-20" }],
    confidence: 0.7,
    ...overrides,
  };
}

function file(overrides: Partial<AssembledFile> = {}): AssembledFile {
  return {
    id: "w1",
    path: "src/a.ts",
    op: "create",
    encoding: "utf8",
    data: "content",
    sha256: "a".repeat(64),
    lines: 1,
    ...overrides,
  };
}

describe("local:concat-ordered", () => {
  const outline: Outline = {
    id: "o1",
    sections: [
      { id: "sec-1", title: "Intro", ownerTaskId: "s1#0", status: "done" },
      { id: "sec-2", title: "Body", ownerTaskId: "s1#1", status: "done" },
    ],
  };

  it("concatenates sections in outline order regardless of task/arrival order", () => {
    const inputs: TaskResult<SectionResult[]>[] = [
      { taskId: "s1#1", value: [{ id: "sec-2", title: "Body", body: "the body" }] },
      { taskId: "s1#0", value: [{ id: "sec-1", title: "Intro", body: "the intro" }] },
    ];
    const result = concatOrdered(inputs, { stageId: "s1", outline });
    expect(result.value).toBe("## Intro\n\nthe intro\n\n## Body\n\nthe body");
    expect(result.gaps).toHaveLength(0);
    expect(result.needsLlmStitch).toBe(false);
  });

  it("reports a gap and keeps going when a section is missing, instead of throwing", () => {
    const inputs: TaskResult<SectionResult[]>[] = [
      { taskId: "s1#0", value: [{ id: "sec-1", title: "Intro", body: "the intro" }] },
    ];
    const result = concatOrdered(inputs, { stageId: "s1", outline });
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.description).toContain("sec-2");
    expect(result.value).toContain("the intro");
  });

  it("is deterministic — the same input produces bit-for-bit identical output", () => {
    const inputs: TaskResult<SectionResult[]>[] = [
      { taskId: "s1#0", value: [{ id: "sec-1", title: "Intro", body: "x" }] },
      { taskId: "s1#1", value: [{ id: "sec-2", title: "Body", body: "y" }] },
    ];
    const a = concatOrdered(inputs, { stageId: "s1", outline });
    const b = concatOrdered(inputs, { stageId: "s1", outline });
    expect(a).toEqual(b);
  });
});

describe("local:dedupe-findings", () => {
  it("merges near-duplicate findings across different tasks", () => {
    const inputs: TaskResult<Finding[]>[] = [
      { taskId: "s1#0", value: [finding({ id: "f1", confidence: 0.6 })] },
      {
        taskId: "s1#1",
        value: [finding({ id: "f2", claim: "authguard validates jwt tokens", confidence: 0.9 })],
      },
    ];
    const result = dedupeFindings(inputs, { stageId: "s1" });
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.confidence).toBe(0.9);
  });

  it("is deterministic", () => {
    const inputs: TaskResult<Finding[]>[] = [{ taskId: "s1#0", value: [finding()] }];
    expect(dedupeFindings(inputs, { stageId: "s1" })).toEqual(dedupeFindings(inputs, { stageId: "s1" }));
  });
});

describe("local:vote", () => {
  it("keeps a claim that a strict majority of members support", () => {
    const inputs: TaskResult<Finding[]>[] = [
      { taskId: "t1", value: [finding({ claim: "the API uses REST" })] },
      { taskId: "t2", value: [finding({ claim: "the api uses rest" })] },
      { taskId: "t3", value: [finding({ claim: "the API is entirely GraphQL" })] },
    ];
    const result = vote(inputs, { stageId: "s1" });
    expect(result.value.some((f) => f.claim.toLowerCase().includes("rest"))).toBe(true);
  });

  it("demotes a non-majority claim to a gap instead of dropping it silently", () => {
    const inputs: TaskResult<Finding[]>[] = [
      { taskId: "t1", value: [finding({ claim: "the API uses REST" })] },
      { taskId: "t2", value: [finding({ claim: "the API is entirely GraphQL" })] },
    ];
    const result = vote(inputs, { stageId: "s1" });
    expect(result.value).toHaveLength(0);
    expect(result.gaps).toHaveLength(2);
    expect(result.gaps.every((g) => g.reason === "ensemble members disagreed")).toBe(true);
  });
});

describe("local:assemble-files", () => {
  it("unions files from every task", () => {
    const inputs: TaskResult<AssembledFile[]>[] = [
      { taskId: "t1", value: [file({ path: "src/a.ts" })] },
      { taskId: "t2", value: [file({ path: "src/b.ts" })] },
    ];
    const result = assembleFiles(inputs, { stageId: "s1" });
    expect(result.value.map((f) => f.path).sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.gaps).toHaveLength(0);
  });

  it("reports (not silently resolves) two tasks writing the same path", () => {
    const inputs: TaskResult<AssembledFile[]>[] = [
      { taskId: "t1", value: [file({ path: "src/a.ts", sha256: "a".repeat(64) })] },
      { taskId: "t2", value: [file({ path: "src/a.ts", sha256: "b".repeat(64) })] },
    ];
    const result = assembleFiles(inputs, { stageId: "s1" });
    expect(result.value).toHaveLength(1); // first writer wins
    expect(result.value[0]?.sha256).toBe("a".repeat(64));
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.description).toContain("src/a.ts");
  });
});
