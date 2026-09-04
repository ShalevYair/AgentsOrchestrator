import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findWorkspaceRoot } from "@ao/platform";

const ENV_VAR = "AO_RECIPES_DIR";

export interface ResolveRecipesDirOptions {
  env?: NodeJS.ProcessEnv;
  /** `import.meta.url` of the calling module — see `resolveAgentsDir`'s own doc (agents-dir.ts) for why this is required rather than defaulted. */
  moduleUrl: string;
}

/**
 * Resolves the `recipes/` directory (TASKS.md P10-T4/T5) — `AO_RECIPES_DIR`
 * if set, otherwise the real repo-root `recipes/` folder. Exactly
 * `resolveAgentsDir`'s own design (agents-dir.ts), one directory name
 * different; kept as its own small function rather than a shared
 * "resolve some named directory" helper — two call sites isn't yet a
 * pattern worth abstracting over, and each already reads clearly on its
 * own.
 */
export function resolveRecipesDir(options: ResolveRecipesDirOptions): string {
  const env = options.env ?? process.env;
  const fromEnv = env[ENV_VAR];
  if (fromEnv) return fromEnv;
  const startDir = dirname(fileURLToPath(options.moduleUrl));
  return join(findWorkspaceRoot(startDir), "recipes");
}
