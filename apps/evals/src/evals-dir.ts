import { resolveWorkspaceSubdir, type ResolveWorkspaceSubdirOptions } from "@ao/platform";

/** `@ao/evals`'s own three directory resolvers (this one, plus `agents-dir.ts`/`recipes-dir.ts`) are thin one-line wrappers around `@ao/platform`'s shared `resolveWorkspaceSubdir` — see that function's own doc for why it exists instead of three more hand-copied versions of `apps/runtime`'s original `resolveAgentsDir`/`resolveRecipesDir`. */
export function resolveEvalsDir(options: ResolveWorkspaceSubdirOptions): string {
  return resolveWorkspaceSubdir("evals", { ...options, envVar: "AO_EVALS_DIR" });
}
