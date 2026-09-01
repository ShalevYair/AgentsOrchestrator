import type { SqlDriver } from "./driver.js";
import { genRunId } from "./ids.js";

export type RunStatus = "running" | "completed" | "failed";

export interface Run {
  id: string;
  threadId: string;
  status: RunStatus;
  createdAt: string;
  finishedAt?: string;
}

interface RunRow {
  id: string;
  thread_id: string;
  status: RunStatus;
  created_at: string;
  finished_at: string | null;
}

function fromRow(row: RunRow): Run {
  const run: Run = { id: row.id, threadId: row.thread_id, status: row.status, createdAt: row.created_at };
  if (row.finished_at !== null) {
    run.finishedAt = row.finished_at;
  }
  return run;
}

export function createRun(driver: SqlDriver, threadId: string, id: string = genRunId()): Run {
  const run: Run = { id, threadId, status: "running", createdAt: new Date().toISOString() };
  driver.run("INSERT INTO runs (id, thread_id, status, created_at, finished_at) VALUES (?, ?, ?, ?, NULL)", [
    run.id,
    run.threadId,
    run.status,
    run.createdAt,
  ]);
  return run;
}

export function finishRun(driver: SqlDriver, id: string, status: "completed" | "failed"): void {
  driver.run("UPDATE runs SET status = ?, finished_at = ? WHERE id = ?", [
    status,
    new Date().toISOString(),
    id,
  ]);
}

export function getRun(driver: SqlDriver, id: string): Run | undefined {
  const row = driver.get<RunRow>(
    "SELECT id, thread_id, status, created_at, finished_at FROM runs WHERE id = ?",
    [id],
  );
  return row ? fromRow(row) : undefined;
}
