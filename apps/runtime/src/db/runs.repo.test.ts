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

  /**
   * TASKS.md P11-T8 — a real, currently-open gap: a "running" row means
   * "a `runChatTurn` was in progress last we knew", and only that same
   * in-process call ever transitions it (via `finishRun`, from inside
   * `run-chat.ts`'s try/catch). If the process dies before that — an OS
   * kill, an out-of-memory crash, a `SIGTERM`/`SIGINT` reaching
   * `apps/runtime/src/index.ts`'s `shutdown()`, which closes the server
   * and DB but never touches in-flight `runs` rows — the row is left
   * "running" forever. There is no startup scan anywhere in `apps/runtime`
   * (grepped: no `orphan`/recovery code exists) that revisits stale
   * "running" rows on the next boot, so a reconnecting client has no event
   * to explain what happened and the thread's `runs` history keeps
   * claiming a run is still active indefinitely.
   *
   * This is a tripwire, not a target to keep passing forever: if a future
   * change adds startup recovery (e.g. marking every "running" row
   * "failed" on boot), this test's second assertion should start failing,
   * which is the signal to update this comment and TASKS.md's P11-T8 note.
   */
  it("KNOWN GAP: a 'running' row from a crashed process is never revisited — simulating a restart on the same DB file changes nothing", () => {
    const run = createRun(driver, threadId);
    expect(getRun(driver, run.id)?.status).toBe("running");

    // Simulate "the process died and came back up": close this handle and
    // reopen the same on-disk file, exactly what apps/runtime/src/index.ts's
    // `openDb` does on every real boot. No migration or startup step exists
    // that would touch existing rows, so nothing here should change that.
    const dbPath = join(dir, "ao.sqlite3");
    driver.close();
    driver = openDatabase(dbPath);
    applyMigrations(driver); // idempotent — the same call index.ts makes on every boot

    expect(getRun(driver, run.id)?.status).toBe("running");
  });
});
