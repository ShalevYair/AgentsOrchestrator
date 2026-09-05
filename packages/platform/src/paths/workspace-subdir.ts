import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findWorkspaceRoot } from "./workspace-root.js";

export interface ResolveWorkspaceSubdirOptions {
  env?: NodeJS.ProcessEnv;
  /** Env var checked first (e.g. `"AO_AGENTS_DIR"`) — an explicit override, same `AO_*` convention as `@ao/platform`'s config loader. Omit for a subdir with no override knob. */
  envVar?: string;
  /**
   * `import.meta.url` of the calling module — anchors the upward search for
   * the repo root. Required rather than defaulted to this module's own URL
   * because callers sit at different depths under the repo root (`src/` vs.
   * `dist/`, a `test-support/` subfolder, …); walking up from *their* real
   * location is what makes the result correct regardless of who's asking.
   */
  moduleUrl: string;
}

/**
 * Resolves `<repo-root>/<dirName>`, `envVar`-overridable — the one bit of
 * logic `apps/runtime`'s `resolveAgentsDir`/`resolveRecipesDir` each wrote
 * out by hand (P10-T1/T5, back when there were only two such directories
 * and "two call sites isn't yet a pattern worth abstracting," per that
 * task's own note). `@ao/evals` (P11-T1) needed a third and fourth
 * (`recipes/`, `evals/`, on top of `agents/`), which is where copy-pasting
 * the same ten lines again stops being the cheaper option. `apps/runtime`'s
 * two existing functions are left as they are — already shipped, already
 * tested, no reason to touch working code — this is only what every new
 * caller (and any future one) should build on instead of copying them
 * again.
 */
export function resolveWorkspaceSubdir(dirName: string, options: ResolveWorkspaceSubdirOptions): string {
  const env = options.env ?? process.env;
  if (options.envVar) {
    const fromEnv = env[options.envVar];
    if (fromEnv) return fromEnv;
  }
  const startDir = dirname(fileURLToPath(options.moduleUrl));
  return join(findWorkspaceRoot(startDir), dirName);
}
