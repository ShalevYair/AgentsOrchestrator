import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { computeSha256, resolveWithinStagingRoot, stageArtifact } from "./artifact-writer.js";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("computeSha256", () => {
  it("matches node:crypto's own sha256 of the same bytes", () => {
    const data = Buffer.from("hello world", "utf8");
    expect(computeSha256(data)).toBe(sha256("hello world"));
  });
});

describe("resolveWithinStagingRoot", () => {
  it("accepts a plain nested relative path", () => {
    const result = resolveWithinStagingRoot("/staging/run1", "src/a.ts");
    expect(result.ok).toBe(true);
    expect(result.resolvedPath).toBe("/staging/run1/src/a.ts");
  });

  it("rejects a path that escapes the root via ..", () => {
    const result = resolveWithinStagingRoot("/staging/run1", "../../etc/passwd");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("escapes");
  });

  it("rejects a path that escapes even when disguised deeper in the path", () => {
    const result = resolveWithinStagingRoot("/staging/run1", "src/../../../etc/passwd");
    expect(result.ok).toBe(false);
  });

  it("does not treat a sibling directory sharing the root as a string prefix as inside the root", () => {
    // "/staging/run1X" starts with "/staging/run1" as a raw string but is a different directory.
    const result = resolveWithinStagingRoot("/staging/run1", "../run1X/evil.ts");
    expect(result.ok).toBe(false);
  });

  it("stays within the root for a path that merely uses .. to normalize internally", () => {
    const result = resolveWithinStagingRoot("/staging/run1", "src/sub/../a.ts");
    expect(result.ok).toBe(true);
    expect(result.resolvedPath).toBe("/staging/run1/src/a.ts");
  });
});

describe("stageArtifact", () => {
  it("writes valid, in-root, hash-matching content and returns ok:true", async () => {
    const data = Buffer.from("export const x = 1;", "utf8");
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const outcome = await stageArtifact({
      stagingRoot: "/staging/run1",
      relativePath: "src/a.ts",
      data,
      expectedSha256: computeSha256(data),
      writeFile,
    });

    expect(outcome).toEqual({ ok: true, stagedPath: "/staging/run1/src/a.ts", sha256: computeSha256(data) });
    expect(writeFile).toHaveBeenCalledWith("/staging/run1/src/a.ts", data);
  });

  it("rejects an invalid filename before ever calling writeFile, and offers a suggestion", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const data = Buffer.from("x", "utf8");

    const outcome = await stageArtifact({
      stagingRoot: "/staging/run1",
      relativePath: "src/aux.ts",
      data,
      expectedSha256: computeSha256(data),
      writeFile,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.reason === "invalid-filename") {
      expect(outcome.suggestedPath).toBe("src/aux_file.ts");
    } else {
      throw new Error("expected invalid-filename outcome");
    }
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("rejects a path that escapes the staging root before ever calling writeFile", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const data = Buffer.from("x", "utf8");

    const outcome = await stageArtifact({
      stagingRoot: "/staging/run1",
      relativePath: "../../etc/passwd",
      data,
      expectedSha256: computeSha256(data),
      writeFile,
    });

    expect(outcome).toMatchObject({ ok: false, reason: "path-traversal" });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("rejects mismatched content before ever calling writeFile", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const data = Buffer.from("real content", "utf8");

    const outcome = await stageArtifact({
      stagingRoot: "/staging/run1",
      relativePath: "src/a.ts",
      data,
      expectedSha256: "0".repeat(64),
      writeFile,
    });

    expect(outcome).toMatchObject({ ok: false, reason: "hash-mismatch" });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("never throws for any of the three expected-rejection paths", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const data = Buffer.from("x", "utf8");
    const cases = [
      { relativePath: "aux.ts", expectedSha256: computeSha256(data) },
      { relativePath: "../escape.ts", expectedSha256: computeSha256(data) },
      { relativePath: "ok.ts", expectedSha256: "0".repeat(64) },
    ];
    for (const c of cases) {
      await expect(
        stageArtifact({ stagingRoot: "/staging/run1", data, writeFile, ...c }),
      ).resolves.toMatchObject({ ok: false });
    }
  });
});
