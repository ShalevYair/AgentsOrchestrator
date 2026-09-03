import type { SqlDriver } from "./driver.js";

/**
 * P2-T2: a `schema_migrations` table plus an ordered list of idempotent SQL
 * steps, run automatically at startup (`applyMigrations`). Deliberately
 * simple for the walking skeleton — each step is `CREATE TABLE IF NOT
 * EXISTS` so re-running is always safe — but the ledger of applied ids
 * gives a real forward-only migration in P3+ somewhere to append to
 * without redesigning this runner.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_init",
    sql: `
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        role TEXT NOT NULL CHECK (role IN ('user','assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        usage_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_thread_created
        ON messages(thread_id, created_at);

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
        created_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_runs_thread ON runs(thread_id);

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id),
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_events_run_seq ON events(run_id, seq);
    `,
  },
  {
    // P9-T1: the goal button's settings (packages/shared's GoalConfig),
    // persisted per-thread ("נשמר לשיחה", UX.md §3) — NULL means "never
    // customized", read back as DEFAULT_GOAL_CONFIG (see threads.repo.ts),
    // not as a separate "unset" state the UI has to handle.
    id: "0002_thread_goal_config",
    sql: `ALTER TABLE threads ADD COLUMN goal_config_json TEXT;`,
  },
  {
    // P9-T11: UX.md §2's "עצור" (stop) button — a user-stopped run is
    // neither "completed" (it wasn't) nor "failed" (nothing went wrong;
    // the user chose to stop it) — it needs its own status so the client
    // can tell the two apart. SQLite can't ALTER a CHECK constraint
    // directly, so this is the standard recreate-copy-swap procedure
    // (SQLite's own documented workaround for unsupported ALTER TABLE
    // operations) rather than a plain ALTER.
    id: "0003_run_status_stopped",
    sql: `
      PRAGMA foreign_keys=off;
      BEGIN TRANSACTION;

      CREATE TABLE runs_new (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        status TEXT NOT NULL CHECK (status IN ('running','completed','failed','stopped')),
        created_at TEXT NOT NULL,
        finished_at TEXT
      );
      INSERT INTO runs_new (id, thread_id, status, created_at, finished_at)
        SELECT id, thread_id, status, created_at, finished_at FROM runs;
      DROP TABLE runs;
      ALTER TABLE runs_new RENAME TO runs;
      CREATE INDEX IF NOT EXISTS idx_runs_thread ON runs(thread_id);

      COMMIT;
      PRAGMA foreign_keys=on;
    `,
  },
];

export function applyMigrations(driver: SqlDriver, migrations: Migration[] = MIGRATIONS): void {
  driver.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  for (const migration of migrations) {
    const applied = driver.get<{ id: string }>("SELECT id FROM schema_migrations WHERE id = ?", [
      migration.id,
    ]);
    if (applied) continue;
    driver.exec(migration.sql);
    driver.run("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", [
      migration.id,
      new Date().toISOString(),
    ]);
  }
}
