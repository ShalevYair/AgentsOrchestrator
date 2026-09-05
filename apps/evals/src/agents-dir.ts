import { resolveWorkspaceSubdir, type ResolveWorkspaceSubdirOptions } from "@ao/platform";

/** Same `AO_AGENTS_DIR` env var as `apps/runtime`'s `resolveAgentsDir` — an override applies to both apps identically. See `evals-dir.ts`'s doc for why this is a thin wrapper rather than a hand-copied duplicate. */
export function resolveAgentsDir(options: ResolveWorkspaceSubdirOptions): string {
  return resolveWorkspaceSubdir("agents", { ...options, envVar: "AO_AGENTS_DIR" });
}
