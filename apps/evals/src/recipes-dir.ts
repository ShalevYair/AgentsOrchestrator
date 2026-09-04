import { resolveWorkspaceSubdir, type ResolveWorkspaceSubdirOptions } from "@ao/platform";

/** Same `AO_RECIPES_DIR` env var as `apps/runtime`'s `resolveRecipesDir` — an override applies to both apps identically. See `evals-dir.ts`'s doc for why this is a thin wrapper rather than a hand-copied duplicate. */
export function resolveRecipesDir(options: ResolveWorkspaceSubdirOptions): string {
  return resolveWorkspaceSubdir("recipes", { ...options, envVar: "AO_RECIPES_DIR" });
}
