import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findWorkspaceRoot } from "@ao/platform";

const ENV_VAR = "AO_AGENTS_DIR";

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
 * folder (`@ao/platform`'s `findWorkspaceRoot`).
 */
export function resolveAgentsDir(options: ResolveAgentsDirOptions): string {
  const env = options.env ?? process.env;
  const fromEnv = env[ENV_VAR];
  if (fromEnv) return fromEnv;
  const startDir = dirname(fileURLToPath(options.moduleUrl));
  return join(findWorkspaceRoot(startDir), "agents");
}
