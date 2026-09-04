import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError } from "@ao/shared";

const ENV_VAR = "AO_AGENTS_DIR";
/** Present only at the repo root — every package/app directory below it lacks this file, so it's a safe anchor to walk up to. */
const WORKSPACE_MARKER = "pnpm-workspace.yaml";
const MAX_WALK_UP = 12;

function findRepoRoot(startDir: string): string {
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

export interface ResolveAgentsDirOptions {
  env?: NodeJS.ProcessEnv;
  /**
   * `import.meta.url` of the calling module — anchors the upward search for
   * the repo root. Required rather than defaulted to this module's own URL
   * because callers sit at different depths under the repo root (`src/` vs.
   * `dist/`, `src/test-support/`, …); walking up from *their* real location
   * is what makes the result correct regardless of who's asking.
   */
  moduleUrl: string;
}

/**
 * Resolves the `agents/` directory PROTOCOLS.md §10 describes —
 * `AO_AGENTS_DIR` if set (explicit override, same `AO_*` convention as
 * `@ao/platform`'s config loader), otherwise the real repo-root `agents/`
 * folder, located by walking up from the caller's own file to the workspace
 * root rather than assuming a fixed number of `..` segments (which differs
 * between `apps/runtime/src/index.ts` and, say, a test-support module one
 * directory deeper).
 */
export function resolveAgentsDir(options: ResolveAgentsDirOptions): string {
  const env = options.env ?? process.env;
  const fromEnv = env[ENV_VAR];
  if (fromEnv) return fromEnv;
  const startDir = dirname(fileURLToPath(options.moduleUrl));
  return join(findRepoRoot(startDir), "agents");
}
