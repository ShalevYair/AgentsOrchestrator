import { homedir } from "node:os";

/**
 * Node never expands a leading "~" the way a shell would — a config value
 * copied verbatim from config.example.jsonc ("~/.agents-orchestrator")
 * would otherwise become a literal, nonexistent relative path on every
 * platform. This is the one place that expansion happens, so every
 * consumer of a config-provided path gets a real absolute path already.
 */
export function expandHome(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return homedir() + path.slice(1);
  }
  return path;
}
