import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type SqlDriver } from "./driver.js";
import { applyMigrations, MIGRATIONS } from "./migrations.js";
import { createThread } from "./threads.repo.js";
import { createRun, getRun } from "./runs.repo.js";
import { appendEvent, listEventsSince } from "./events.repo.js";

let dir: string;
let driver: SqlDriver;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-migrations-"));
  driver = openDatabase(join(dir, "ao.sqlite3"));
});

afterEach(() => {
  driver.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("migrations (0003_run_status_stopped)", () => {
  it("a pre-existing run and its events survive the recreate-table migration intact", () => {
    // Real upgrade path: a DB that only ever saw 0001+0002 (pre-P9-T11),
    // with real data in it, then upgraded — not a fresh DB that happens
    // to already have the new schema from day one.
    applyMigrations(driver, MIGRATIONS.slice(0, 2));
    const thread = createThread(driver, "t");
    const run = createRun(driver, thread.id);
    appendEvent(driver, { runId: run.id, type: "run.started", payload: { ok: true } });

    applyMigrations(driver, MIGRATIONS);

    const foundRun = getRun(driver, run.id);
    expect(foundRun?.id).toBe(run.id);
    expect(foundRun?.status).toBe("running");
    expect(foundRun?.threadId).toBe(thread.id);
    const events = listEventsSince(driver, run.id, -1);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("run.started");
  });

  it("the CHECK constraint is still real after the migration — an invalid status is rejected", () => {
    applyMigrations(driver);
    const thread = createThread(driver, "t");
    const run = createRun(driver, thread.id);
    expect(() => {
      driver.run("UPDATE runs SET status = ? WHERE id = ?", ["not-a-real-status", run.id]);
    }).toThrow();
  });

  it("'stopped' is accepted as a real status after the migration", () => {
    applyMigrations(driver);
    const thread = createThread(driver, "t");
    const run = createRun(driver, thread.id);
    expect(() => {
      driver.run("UPDATE runs SET status = ? WHERE id = ?", ["stopped", run.id]);
    }).not.toThrow();
    expect(getRun(driver, run.id)?.status).toBe("stopped");
  });
});
