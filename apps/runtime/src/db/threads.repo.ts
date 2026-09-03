import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import { GoalConfigSchema, type GoalConfig } from "@ao/shared";
import type { SqlDriver } from "./driver.js";
import { genThreadId } from "./ids.js";

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  goalConfig: GoalConfig;
}

interface ThreadRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  goal_config_json: string | null;
}

const THREAD_COLUMNS = "id, title, created_at, updated_at, goal_config_json";

/**
 * Never throws on a malformed/missing stored value — same defensive stance
 * as every other stored-JSON read in this codebase (e.g. events.repo.ts's
 * RuntimeEventSchema.parse on replay). A row with no customization yet, or
 * one written by a future/older shape that no longer parses, both fall
 * back to DEFAULT_GOAL_CONFIG rather than surfacing an error to the user.
 */
function parseGoalConfig(json: string | null): GoalConfig {
  if (json === null) return DEFAULT_GOAL_CONFIG;
  try {
    const result = GoalConfigSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : DEFAULT_GOAL_CONFIG;
  } catch {
    return DEFAULT_GOAL_CONFIG;
  }
}

function fromRow(row: ThreadRow): Thread {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    goalConfig: parseGoalConfig(row.goal_config_json),
  };
}

export function createThread(driver: SqlDriver, title: string): Thread {
  const now = new Date().toISOString();
  const thread: Thread = {
    id: genThreadId(),
    title,
    createdAt: now,
    updatedAt: now,
    goalConfig: DEFAULT_GOAL_CONFIG,
  };
  driver.run("INSERT INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)", [
    thread.id,
    thread.title,
    thread.createdAt,
    thread.updatedAt,
  ]);
  return thread;
}

export function listThreads(driver: SqlDriver): Thread[] {
  return driver.all<ThreadRow>(`SELECT ${THREAD_COLUMNS} FROM threads ORDER BY updated_at DESC`).map(fromRow);
}

export function getThread(driver: SqlDriver, id: string): Thread | undefined {
  const row = driver.get<ThreadRow>(`SELECT ${THREAD_COLUMNS} FROM threads WHERE id = ?`, [id]);
  return row ? fromRow(row) : undefined;
}

export function touchThread(
  driver: SqlDriver,
  id: string,
  updatedAt: string = new Date().toISOString(),
): void {
  driver.run("UPDATE threads SET updated_at = ? WHERE id = ?", [updatedAt, id]);
}

/** P9-T1: the goal button's "נשמר לשיחה" persistence. Does not touch `updated_at` — changing settings isn't chat activity, and bumping it would reorder the thread list (P9-T12) for a non-conversational edit. */
export function updateThreadGoalConfig(driver: SqlDriver, id: string, goalConfig: GoalConfig): void {
  driver.run("UPDATE threads SET goal_config_json = ? WHERE id = ?", [JSON.stringify(goalConfig), id]);
}
