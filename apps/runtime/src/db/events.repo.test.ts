import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type SqlDriver } from "./driver.js";
import { applyMigrations } from "./migrations.js";
import { createThread } from "./threads.repo.js";
import { createRun } from "./runs.repo.js";
import { appendEvent, listEventsSince, nextSeq } from "./events.repo.js";

let dir: string;
let driver: SqlDriver;
let runId: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-events-"));
  driver = openDatabase(join(dir, "ao.sqlite3"));
  applyMigrations(driver);
  const threadId = createThread(driver, "t").id;
  runId = createRun(driver, threadId).id;
});

afterEach(() => {
  driver.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("events.repo", () => {
  it("assigns monotonically increasing seq per run, starting at 0", () => {
    expect(nextSeq(driver, runId)).toBe(0);
    const e0 = appendEvent(driver, { runId, type: "run.started", payload: { a: 1 } });
    const e1 = appendEvent(driver, { runId, type: "task.delta", payload: { b: 2 } });
    expect(e0.seq).toBe(0);
    expect(e1.seq).toBe(1);
  });

  it("keeps seq counters independent per run", () => {
    const threadId = createThread(driver, "t2").id;
    const otherRun = createRun(driver, threadId).id;
    appendEvent(driver, { runId, type: "run.started", payload: {} });
    const first = appendEvent(driver, { runId: otherRun, type: "run.started", payload: {} });
    expect(first.seq).toBe(0);
  });

  it("listEventsSince returns only events after the given seq, in order", () => {
    for (let i = 0; i < 5; i++) {
      appendEvent(driver, { runId, type: "task.delta", payload: { i } });
    }
    const since2 = listEventsSince(driver, runId, 2);
    expect(since2.map((e) => e.seq)).toEqual([3, 4]);
  });

  it("listEventsSince(-1) returns everything (full replay for a fresh subscriber)", () => {
    appendEvent(driver, { runId, type: "run.started", payload: {} });
    appendEvent(driver, { runId, type: "run.finished", payload: {} });
    expect(listEventsSince(driver, runId, -1)).toHaveLength(2);
  });

  it("round-trips arbitrary JSON payloads", () => {
    const payload = { taskId: "run_x#0", envelope: { t: "note", text: "hi" } };
    const stored = appendEvent(driver, { runId, type: "task.delta", payload });
    const [found] = listEventsSince(driver, runId, -1);
    expect(found).toEqual(stored);
    expect(found?.payload).toEqual(payload);
  });
});
