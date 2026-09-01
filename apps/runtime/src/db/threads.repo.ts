import type { SqlDriver } from "./driver.js";
import { genThreadId } from "./ids.js";

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ThreadRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

function fromRow(row: ThreadRow): Thread {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function createThread(driver: SqlDriver, title: string): Thread {
  const now = new Date().toISOString();
  const thread: Thread = { id: genThreadId(), title, createdAt: now, updatedAt: now };
  driver.run("INSERT INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)", [
    thread.id,
    thread.title,
    thread.createdAt,
    thread.updatedAt,
  ]);
  return thread;
}

export function listThreads(driver: SqlDriver): Thread[] {
  return driver
    .all<ThreadRow>("SELECT id, title, created_at, updated_at FROM threads ORDER BY updated_at DESC")
    .map(fromRow);
}

export function getThread(driver: SqlDriver, id: string): Thread | undefined {
  const row = driver.get<ThreadRow>("SELECT id, title, created_at, updated_at FROM threads WHERE id = ?", [
    id,
  ]);
  return row ? fromRow(row) : undefined;
}

export function touchThread(
  driver: SqlDriver,
  id: string,
  updatedAt: string = new Date().toISOString(),
): void {
  driver.run("UPDATE threads SET updated_at = ? WHERE id = ?", [updatedAt, id]);
}
