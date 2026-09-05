/* eslint-disable no-console -- this file's whole job is CLI progress/error output, same precedent as apps/evals/src/index.ts / packages/providers/src/demo.ts. */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startRuntime } from "@ao/runtime";
import { parseArgs } from "./cli-args.js";
import { openBrowser } from "./open-browser.js";

/**
 * P12-T1: everything a standalone install needs bundled alongside the
 * bundled `dist/cli.js` — the built web UI, plus the `agents/`/`recipes/`
 * directories that only exist as source in this monorepo otherwise
 * (`resolveAgentsDir`/`resolveRecipesDir` normally walk up to a
 * `pnpm-workspace.yaml` that a published tarball never has). `dirname`
 * of *this file's own* resolved path, not `process.cwd()` — must work
 * from any working directory the user happens to run the command from.
 */
function bundledDir(name: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), name);
}

function setDirEnvDefault(envVar: string, value: string): void {
  // Deliberately falsy, not `??=`: an env var explicitly set to "" is not a
  // usable directory path either, so it should fall back to the bundled
  // default exactly like an unset var — `??=` would leave "" in place.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!process.env[envVar]) process.env[envVar] = value;
}

function shouldOpenBrowser(args: { open: boolean }): boolean {
  if (!args.open) return false;
  if (process.env["AO_NO_OPEN_BROWSER"]) return false;
  if (process.env["CI"]) return false;
  return true;
}

export async function run(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);

  setDirEnvDefault("AO_AGENTS_DIR", bundledDir("agents"));
  setDirEnvDefault("AO_RECIPES_DIR", bundledDir("recipes"));

  const startOptions: Parameters<typeof startRuntime>[0] = {
    staticDir: bundledDir("public"),
    ...(args.port !== undefined ? { port: args.port } : {}),
    ...(args.host !== undefined ? { host: args.host } : {}),
  };
  const { port, host, shutdown } = await startRuntime(startOptions);

  const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${String(port)}/`;
  console.log(`AgentsOrchestrator is running at ${url}`);

  if (shouldOpenBrowser(args)) {
    const opened = await openBrowser(url);
    if (!opened) console.log("Could not open a browser automatically — open the URL above by hand.");
  }

  const handleSignal = (signal: string): void => {
    void shutdown(signal).finally(() => {
      process.exit(0);
    });
  };
  process.on("SIGINT", () => {
    handleSignal("SIGINT");
  });
  process.on("SIGTERM", () => {
    handleSignal("SIGTERM");
  });
}

// Same "only auto-run as the actual process entry point" guard as
// apps/runtime/src/index.ts — lets cli.test.ts import `run` directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
