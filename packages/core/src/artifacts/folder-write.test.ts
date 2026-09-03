import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FOLDER_WRITE_ENABLED, writeToFolder } from "./folder-write.js";

describe("DEFAULT_FOLDER_WRITE_ENABLED", () => {
  it("is off by default (Q3)", () => {
    expect(DEFAULT_FOLDER_WRITE_ENABLED).toBe(false);
  });
});

function harness(existing: Buffer | null) {
  return {
    readExisting: vi.fn().mockResolvedValue(existing),
    writeFile: vi.fn().mockResolvedValue(undefined),
    writeBackup: vi.fn().mockResolvedValue("/backups/file.ts.bak"),
  };
}

describe("writeToFolder", () => {
  it("never writes when disabled, but still returns a diff and an explicit reason — never silent", async () => {
    const h = harness(Buffer.from("old content", "utf8"));
    const outcome = await writeToFolder({
      enabled: false,
      approved: true,
      newContent: Buffer.from("new content", "utf8"),
      ...h,
    });

    expect(outcome.wrote).toBe(false);
    expect(outcome.reason).toBe("disabled");
    expect(outcome.diff).toContain("old content");
    expect(outcome.diff).toContain("new content");
    expect(h.writeFile).not.toHaveBeenCalled();
    expect(h.writeBackup).not.toHaveBeenCalled();
  });

  it("never writes without explicit per-write approval, even when the feature is enabled", async () => {
    const h = harness(null);
    const outcome = await writeToFolder({
      enabled: true,
      approved: false,
      newContent: Buffer.from("new content", "utf8"),
      ...h,
    });

    expect(outcome.wrote).toBe(false);
    expect(outcome.reason).toBe("not-approved");
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it("writes a brand-new file (no prior content) without taking a backup", async () => {
    const h = harness(null);
    const outcome = await writeToFolder({
      enabled: true,
      approved: true,
      newContent: Buffer.from("brand new", "utf8"),
      ...h,
    });

    expect(outcome.wrote).toBe(true);
    expect(outcome.backupPath).toBeUndefined();
    expect(h.writeBackup).not.toHaveBeenCalled();
    expect(h.writeFile).toHaveBeenCalledWith(Buffer.from("brand new", "utf8"));
  });

  it("backs up the existing file before overwriting it, and reports the backup path", async () => {
    const h = harness(Buffer.from("old content", "utf8"));
    const outcome = await writeToFolder({
      enabled: true,
      approved: true,
      newContent: Buffer.from("new content", "utf8"),
      ...h,
    });

    expect(outcome.wrote).toBe(true);
    expect(outcome.backupPath).toBe("/backups/file.ts.bak");
    expect(h.writeBackup).toHaveBeenCalledWith(Buffer.from("old content", "utf8"));
    // backup must happen before the overwrite — otherwise there is nothing left to back up
    expect(h.writeBackup.mock.invocationCallOrder[0]).toBeLessThan(h.writeFile.mock.invocationCallOrder[0]!);
  });

  it("always returns a non-empty diff for any real content change", async () => {
    const h = harness(Buffer.from("a\nb\nc", "utf8"));
    const outcome = await writeToFolder({
      enabled: true,
      approved: true,
      newContent: Buffer.from("a\nB\nc", "utf8"),
      ...h,
    });
    expect(outcome.diff).toBe(" a\n-b\n+B\n c");
  });
});
