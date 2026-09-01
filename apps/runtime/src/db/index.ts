import { join } from "node:path";
import { openDatabase, type SqlDriver } from "./driver.js";
import { applyMigrations } from "./migrations.js";

export type { SqlDriver, RunResult } from "./driver.js";
export { MIGRATIONS, applyMigrations, type Migration } from "./migrations.js";
export * from "./threads.repo.js";
export * from "./messages.repo.js";
export * from "./runs.repo.js";
export * from "./events.repo.js";

/** Opens the database file under `dataDir` and runs migrations — the one call sites outside `db/` should ever need. */
export function openDb(dataDir: string): SqlDriver {
  const driver = openDatabase(join(dataDir, "ao.sqlite3"));
  applyMigrations(driver);
  return driver;
}
