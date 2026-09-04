import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import type { GoalConfig } from "@ao/shared";
import { openDatabase, type SqlDriver } from "./driver.js";
import { appendEvent, listEventsSince } from "./events.repo.js";
import { insertMessage, listMessages } from "./messages.repo.js";
import { applyMigrations } from "./migrations.js";
import { createRun, getRun } from "./runs.repo.js";
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  touchThread,
  updateThreadGoalConfig,
} from "./threads.repo.js";

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

  it("defaults a brand-new thread's goalConfig to DEFAULT_GOAL_CONFIG", () => {
    const thread = createThread(driver, "Fresh");
    expect(thread.goalConfig).toEqual(DEFAULT_GOAL_CONFIG);
  });

  it("persists an updated goalConfig and reads it back", () => {
    const thread = createThread(driver, "Custom");
    const customized: GoalConfig = {
      ...DEFAULT_GOAL_CONFIG,
      level: "deep",
      budgetTotal: 5_000_000,
      effort: "high",
      overrunPolicy: "hard-stop",
      allowFolderWrite: true,
    };
    updateThreadGoalConfig(driver, thread.id, customized);
    expect(getThread(driver, thread.id)?.goalConfig).toEqual(customized);
  });

  it("updating goalConfig does not change updated_at (not chat activity)", () => {
    const thread = createThread(driver, "Custom");
    updateThreadGoalConfig(driver, thread.id, {
      ...DEFAULT_GOAL_CONFIG,
      level: "draft",
      budgetTotal: 500_000,
    });
    expect(getThread(driver, thread.id)?.updatedAt).toBe(thread.updatedAt);
  });

  it("falls back to DEFAULT_GOAL_CONFIG for a malformed stored value", () => {
    const thread = createThread(driver, "Corrupt");
    driver.run("UPDATE threads SET goal_config_json = ? WHERE id = ?", ["not json at all", thread.id]);
    expect(getThread(driver, thread.id)?.goalConfig).toEqual(DEFAULT_GOAL_CONFIG);
  });

  describe("deleteThread (P9-T12)", () => {
    it("deletes a thread with no messages/runs at all", () => {
      const thread = createThread(driver, "Empty");
      deleteThread(driver, thread.id);
      expect(getThread(driver, thread.id)).toBeUndefined();
    });

    it("cascades: a thread's messages, runs, and those runs' events are all gone too", () => {
      const thread = createThread(driver, "Full");
      insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
      const run = createRun(driver, thread.id);
      appendEvent(driver, { runId: run.id, type: "run.started", payload: { ok: true } });

      deleteThread(driver, thread.id);

      expect(getThread(driver, thread.id)).toBeUndefined();
      expect(listMessages(driver, thread.id)).toEqual([]);
      expect(getRun(driver, run.id)).toBeUndefined();
      expect(listEventsSince(driver, run.id, -1)).toEqual([]);
    });

    it("deleting one thread never touches another thread's data", () => {
      const keep = createThread(driver, "Keep me");
      insertMessage(driver, { threadId: keep.id, role: "user", content: "still here" });
      const doomed = createThread(driver, "Delete me");
      insertMessage(driver, { threadId: doomed.id, role: "user", content: "gone" });

      deleteThread(driver, doomed.id);

      expect(getThread(driver, keep.id)).toEqual(keep);
      expect(listMessages(driver, keep.id)).toHaveLength(1);
    });

    it("deleting an id that doesn't exist is a harmless no-op, not a throw", () => {
      expect(() => {
        deleteThread(driver, "thr_never_existed");
      }).not.toThrow();
    });
  });
});
