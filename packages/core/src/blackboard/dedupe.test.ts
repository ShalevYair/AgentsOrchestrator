import type { Finding } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { claimSimilarity, findDuplicate, isDuplicateClaim, mergeFindings, normalizeClaim } from "./dedupe.js";

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

describe("normalizeClaim", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeClaim("AuthGuard validates JWT-tokens!!")).toBe("authguard validates jwt tokens");
  });

  it("keeps Hebrew letters intact", () => {
    expect(normalizeClaim("המערכת בודקת הרשאות.")).toBe("המערכת בודקת הרשאות");
  });
});

describe("claimSimilarity", () => {
  it("is 1.0 for identical claims", () => {
    expect(claimSimilarity("x validates y", "x validates y")).toBe(1);
  });

  it("is 0 for completely disjoint claims", () => {
    expect(claimSimilarity("auth guard checks tokens", "database uses postgres storage")).toBe(0);
  });

  it("is between 0 and 1 for partially overlapping claims", () => {
    const score = claimSimilarity("auth guard validates jwt tokens", "auth guard validates jwt claims");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("isDuplicateClaim", () => {
  it("matches claims that differ only in punctuation/case", () => {
    expect(isDuplicateClaim("AuthGuard validates JWT.", "authguard validates jwt")).toBe(true);
  });

  it("matches near-identical phrasing above the threshold", () => {
    expect(
      isDuplicateClaim(
        "the auth guard validates jwt tokens on every request",
        "the auth guard validates jwt tokens for every request",
      ),
    ).toBe(true);
  });

  it("does not match unrelated claims", () => {
    expect(
      isDuplicateClaim("AuthGuard validates JWT tokens", "the database schema uses UUID primary keys"),
    ).toBe(false);
  });
});

describe("mergeFindings", () => {
  it("unions evidence, unions tags, and keeps the higher confidence", () => {
    const existing = finding({
      tags: ["auth"],
      evidence: [{ artifact: "a1", loc: "src/auth.ts:10-20" }],
      confidence: 0.6,
    });
    const incoming = finding({
      id: "f2",
      stageId: "s2",
      tags: ["security"],
      evidence: [{ artifact: "a2", loc: "src/guard.ts:1-5" }],
      confidence: 0.9,
    });
    const merged = mergeFindings(existing, incoming);
    expect(merged.id).toBe("f1"); // identity is kept from `existing`
    expect(merged.confidence).toBe(0.9);
    expect(merged.tags.sort()).toEqual(["auth", "security"]);
    expect(merged.evidence).toHaveLength(2);
  });

  it("deduplicates identical evidence entries instead of repeating them", () => {
    const evidence = [{ artifact: "a1", loc: "src/auth.ts:10-20" }];
    const existing = finding({ evidence });
    const incoming = finding({ id: "f2", evidence });
    const merged = mergeFindings(existing, incoming);
    expect(merged.evidence).toHaveLength(1);
  });
});

describe("findDuplicate", () => {
  it("returns the matching finding when one exists", () => {
    const existing = [finding({ id: "f1", claim: "AuthGuard validates JWT tokens" })];
    const candidate = finding({ id: "f2", claim: "authguard validates jwt tokens" });
    expect(findDuplicate(existing, candidate)?.id).toBe("f1");
  });

  it("returns undefined when nothing matches", () => {
    const existing = [finding({ id: "f1", claim: "AuthGuard validates JWT tokens" })];
    const candidate = finding({ id: "f2", claim: "the build pipeline runs on GitHub Actions" });
    expect(findDuplicate(existing, candidate)).toBeUndefined();
  });
});
