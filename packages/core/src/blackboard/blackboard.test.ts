import type { Finding } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Blackboard } from "./blackboard.js";

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

describe("Blackboard.addFinding — deduplication", () => {
  it("appends a genuinely new finding", () => {
    const board = new Blackboard();
    const result = board.addFinding(finding());
    expect(result.merged).toBe(false);
    expect(board.snapshot().findings).toHaveLength(1);
  });

  it("merges a near-duplicate finding instead of appending a second copy", () => {
    const board = new Blackboard();
    board.addFinding(finding({ id: "f1", confidence: 0.6, tags: ["auth"] }));
    const result = board.addFinding(
      finding({ id: "f2", claim: "authguard validates jwt tokens", confidence: 0.9, tags: ["security"] }),
    );
    expect(result.merged).toBe(true);
    const snapshot = board.snapshot();
    expect(snapshot.findings).toHaveLength(1);
    expect(snapshot.findings[0]?.confidence).toBe(0.9);
    expect(snapshot.findings[0]?.tags.sort()).toEqual(["auth", "security"]);
  });

  it("keeps unrelated findings separate", () => {
    const board = new Blackboard();
    board.addFinding(finding({ id: "f1", claim: "AuthGuard validates JWT tokens" }));
    board.addFinding(finding({ id: "f2", claim: "the database schema uses UUID primary keys" }));
    expect(board.snapshot().findings).toHaveLength(2);
  });
});

describe("Blackboard — artifacts/decisions/openQuestions/outline", () => {
  it("upserts artifacts by id", () => {
    const board = new Blackboard();
    board.addArtifact({ id: "w1", path: "src/a.ts", sha256: "a".repeat(64), stageId: "s1" });
    board.addArtifact({ id: "w1", path: "src/a.ts", sha256: "b".repeat(64), stageId: "s2" });
    const snapshot = board.snapshot();
    expect(snapshot.artifacts).toHaveLength(1);
    expect(snapshot.artifacts[0]?.sha256).toBe("b".repeat(64));
  });

  it("records decisions in order", () => {
    const board = new Blackboard();
    board.addDecision({ id: "d1", text: "use Fastify", rationale: "lightweight", stageId: "s1" });
    expect(board.snapshot().decisions).toEqual([
      { id: "d1", text: "use Fastify", rationale: "lightweight", stageId: "s1" },
    ]);
  });

  it("resolves an open question exactly once", () => {
    const board = new Blackboard();
    board.addOpenQuestion({ id: "q1", text: "include tests?", raisedBy: "s1", resolvedBy: null });
    expect(board.resolveOpenQuestion("q1", "s2")).toBe(true);
    expect(board.resolveOpenQuestion("q1", "s3")).toBe(false); // already resolved
    expect(board.resolveOpenQuestion("ghost", "s3")).toBe(false); // unknown id
    expect(board.getOpenQuestions()[0]?.resolvedBy).toBe("s2");
  });

  it("sets an outline and updates section status by id", () => {
    const board = new Blackboard();
    board.setOutline({
      id: "o1",
      sections: [{ id: "sec-1", title: "intro", ownerTaskId: "s4#0", status: "pending" }],
    });
    expect(board.updateSectionStatus("sec-1", "done")).toBe(true);
    expect(board.updateSectionStatus("ghost", "done")).toBe(false);
    expect(board.getOutlineSections()[0]?.status).toBe("done");
  });
});

describe("Blackboard — the Broker-only read path for agents", () => {
  it("formats findings as tagged, prioritized context candidates", () => {
    const board = new Blackboard();
    board.addFinding(finding({ id: "f1", confidence: 0.82 }));
    const candidates = board.findingsAsContextCandidates(4);
    expect(candidates).toEqual([
      { id: "f1", priority: 4, text: "[0.82] AuthGuard validates JWT tokens (a1:src/auth.ts:10-20)" },
    ]);
  });

  it("filters by tag when a tagFilter is supplied", () => {
    const board = new Blackboard();
    board.addFinding(finding({ id: "f1", claim: "auth claim one", tags: ["auth"] }));
    board.addFinding(finding({ id: "f2", claim: "unrelated storage claim", tags: ["storage"] }));
    const candidates = board.findingsAsContextCandidates(4, ["auth"]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe("f1");
  });
});

describe("Blackboard — snapshot/fromSnapshot round trip (P5-T12's persistence half)", () => {
  it("restores an equivalent Blackboard from a prior snapshot", () => {
    const board = new Blackboard();
    board.addFinding(finding());
    board.addArtifact({ id: "w1", path: "src/a.ts", sha256: "a".repeat(64), stageId: "s1" });
    board.addDecision({ id: "d1", text: "x", rationale: "y", stageId: "s1" });
    board.addOpenQuestion({ id: "q1", text: "?", raisedBy: "s1", resolvedBy: null });
    board.setOutline({
      id: "o1",
      sections: [{ id: "sec-1", title: "t", ownerTaskId: "s1#0", status: "pending" }],
    });

    const restored = Blackboard.fromSnapshot(board.snapshot());
    expect(restored.snapshot()).toEqual(board.snapshot());
  });

  it("keeps the restored state independent of the original (no shared mutable references)", () => {
    const board = new Blackboard();
    board.addFinding(finding());
    const restored = Blackboard.fromSnapshot(board.snapshot());
    restored.addFinding(finding({ id: "f2", claim: "a completely different claim about storage" }));
    expect(board.snapshot().findings).toHaveLength(1);
    expect(restored.snapshot().findings).toHaveLength(2);
  });
});
