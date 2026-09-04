import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { ConfigError } from "@ao/shared";

/** Present only at the repo root — every package/app directory below it lacks this file, so it's a safe anchor to walk up to. */
const WORKSPACE_MARKER = "pnpm-workspace.yaml";
const MAX_WALK_UP = 12;

/**
 * Walks up from `startDir` to the monorepo root, identified by
 * `pnpm-workspace.yaml` — not a fixed number of `..` segments, since callers
 * across `apps/*`/`packages/*` sit at different depths under the root (and
 * a file can move without every caller's assumed depth moving with it).
 */
export function findWorkspaceRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < MAX_WALK_UP; i++) {
    if (existsSync(join(dir, WORKSPACE_MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ConfigError(
    `could not locate the repo root (a directory containing ${WORKSPACE_MARKER}) above ${startDir}`,
  );
}
