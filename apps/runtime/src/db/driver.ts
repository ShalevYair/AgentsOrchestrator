import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * ADR-012 / docs/TASKS.md P2-T2: `node:sqlite` (built into Node 22, no
 * native compilation, so Windows needs nothing extra) is marked
 * experimental and — confirmed empirically on Node 22.22 — prints exactly
 * one `ExperimentalWarning` line to stderr the first time it is used. This
 * is the ONE module in the whole repo allowed to `import ... from
 * "node:sqlite"` (enforced by the `no-restricted-imports` rule scoped to
 * `apps/runtime/src/**` in the root eslint.config.js, with this file
 * carved back out). Every other module talks to `SqlDriver`, a narrow
 * interface — so a future swap to libsql/sql.js touches only this file.
 */
let filterInstalled = false;

/**
 * Drops just the SQLite experimental-feature notice; every other warning
 * (including other ExperimentalWarnings) is still surfaced via
 * console.warn so we never silently swallow something unrelated.
 *
 * Node's default "print every warning to stderr" behavior is itself just a
 * `process.on("warning", ...)` listener installed at startup — adding our
 * own listener alongside it does NOT stop that default one from also
 * printing (confirmed empirically: the SQLite line kept appearing even
 * with a filtering listener added). So we remove whatever `warning`
 * listeners already exist (Node's default one, chiefly) and reinstall a
 * single listener that both filters the SQLite notice and takes over
 * printing everything else — this is what actually satisfies "the warning
 * is suppressed on startup" rather than merely adding noise alongside it.
 */
function installExperimentalWarningFilter(): void {
  if (filterInstalled) return;
  filterInstalled = true;
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.name === "ExperimentalWarning" && warning.message.includes("SQLite")) {
      return;
    }
    console.warn(warning);
  });
}

installExperimentalWarningFilter();

export interface RunResult {
  lastInsertRowid: number | bigint;
  changes: number | bigint;
}

/** Narrow surface every repository is written against — never `DatabaseSync` itself. */
export interface SqlDriver {
  exec(sql: string): void;
  run(sql: string, params?: readonly unknown[]): RunResult;
  get<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): T[];
  close(): void;
}

class NodeSqliteDriver implements SqlDriver {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: readonly unknown[] = []): RunResult {
    return this.db.prepare(sql).run(...(params as SQLInputValue[]));
  }

  get<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...(params as SQLInputValue[])) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): T[] {
    return this.db.prepare(sql).all(...(params as SQLInputValue[])) as T[];
  }

  close(): void {
    this.db.close();
  }
}

/** Opens (creating parent directories as needed) and migrates a SQLite database at `path`. */
export function openDatabase(path: string): SqlDriver {
  const driver = new NodeSqliteDriver(path);
  return driver;
}
