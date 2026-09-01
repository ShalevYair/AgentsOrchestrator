import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type SqlDriver } from "./driver.js";
import { applyMigrations } from "./migrations.js";
import { createThread, getThread, listThreads, touchThread } from "./threads.repo.js";

let dir: string;
let driver: SqlDriver;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-threads-"));
  driver = openDatabase(join(dir, "ao.sqlite3"));
  applyMigrations(driver);
});

afterEach(() => {
  driver.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("threads.repo", () => {
  it("creates and retrieves a thread by id", () => {
    const thread = createThread(driver, "My chat");
    expect(thread.id).toMatch(/^thr_[a-f0-9]+$/);
    const found = getThread(driver, thread.id);
    expect(found).toEqual(thread);
  });

  it("returns undefined for an unknown id", () => {
    expect(getThread(driver, "thr_missing")).toBeUndefined();
  });

  it("lists threads newest-updated first", () => {
    const a = createThread(driver, "A");
    const b = createThread(driver, "B");
    touchThread(driver, a.id, "2999-01-01T00:00:00.000Z");
    const [first, second] = listThreads(driver);
    expect(first?.id).toBe(a.id);
    expect(second?.id).toBe(b.id);
  });
});
