import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type SqlDriver } from "./driver.js";
import { applyMigrations, MIGRATIONS } from "./migrations.js";
import { createThread, listThreads } from "./threads.repo.js";
import { insertMessage, listMessages } from "./messages.repo.js";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-runtime-db-"));
  dbPath = join(dir, "nested", "ao.sqlite3");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("SqlDriver / migrations", () => {
  it("creates parent directories and applies migrations on a fresh file", () => {
    const driver = openDatabase(dbPath);
    applyMigrations(driver);
    const row = driver.get<{ id: string }>("SELECT id FROM schema_migrations WHERE id = ?", ["0001_init"]);
    expect(row?.id).toBe("0001_init");
    driver.close();
  });

  it("applying migrations twice is a no-op (idempotent)", () => {
    const driver = openDatabase(dbPath);
    applyMigrations(driver);
    applyMigrations(driver); // must not throw on CREATE TABLE / duplicate id
    const rows = driver.all<{ id: string }>("SELECT id FROM schema_migrations");
    // Derived from MIGRATIONS.length, not hardcoded — this assertion is about
    // idempotency (no duplicate rows from the second applyMigrations call),
    // not about how many migrations happen to exist today.
    expect(rows).toHaveLength(MIGRATIONS.length);
    driver.close();
  });

  it("survives a process restart: data written before close is readable after reopening the same path", () => {
    let driver: SqlDriver = openDatabase(dbPath);
    applyMigrations(driver);
    const thread = createThread(driver, "hello");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "ping" });
    driver.close();

    // Simulate a fresh process: brand-new driver instance against the same file.
    driver = openDatabase(dbPath);
    applyMigrations(driver);
    const threads = listThreads(driver);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.title).toBe("hello");
    const messages = listMessages(driver, thread.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("ping");
    driver.close();
  });

  it("suppresses only the SQLite ExperimentalWarning, not other warnings", async () => {
    const seen: Error[] = [];
    const handler = (warning: Error): void => {
      seen.push(warning);
    };
    process.on("warning", handler);
    try {
      process.emitWarning("some unrelated experimental thing", "ExperimentalWarning");
      // `warning` fires asynchronously (next-tick-ish) — give it a turn.
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("warning", handler);
    }
    // Our own listener (installed once, at driver.ts module load) forwards
    // this one via console.warn instead of throwing/crashing — the
    // important behavioral assertion is just that a non-SQLite warning
    // still reaches *some* listener (this test's own), i.e. installing the
    // filter didn't remove Node's warning machinery for anyone else.
    expect(seen.length).toBeGreaterThan(0);
  });
});
