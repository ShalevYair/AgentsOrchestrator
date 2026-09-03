import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type SqlDriver } from "./driver.js";
import { applyMigrations } from "./migrations.js";
import { createThread } from "./threads.repo.js";
import { createRun, finishRun, getRun } from "./runs.repo.js";

let dir: string;
let driver: SqlDriver;
let threadId: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-runs-"));
  driver = openDatabase(join(dir, "ao.sqlite3"));
  applyMigrations(driver);
  threadId = createThread(driver, "t").id;
});

afterEach(() => {
  driver.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("runs.repo", () => {
  it("starts a run in 'running' status with no finishedAt", () => {
    const run = createRun(driver, threadId);
    expect(run.status).toBe("running");
    expect(run.finishedAt).toBeUndefined();
    expect(run.id).toMatch(/^run_[a-f0-9]+$/);
  });

  it("finishRun sets status and finishedAt", () => {
    const run = createRun(driver, threadId);
    finishRun(driver, run.id, "completed");
    const found = getRun(driver, run.id);
    expect(found?.status).toBe("completed");
    expect(found?.finishedAt).toBeTruthy();
  });

  it("finishRun can record a failure", () => {
    const run = createRun(driver, threadId);
    finishRun(driver, run.id, "failed");
    expect(getRun(driver, run.id)?.status).toBe("failed");
  });

  it("finishRun can record a user-initiated stop (P9-T11, 0003_run_status_stopped)", () => {
    const run = createRun(driver, threadId);
    finishRun(driver, run.id, "stopped");
    expect(getRun(driver, run.id)?.status).toBe("stopped");
  });
});
