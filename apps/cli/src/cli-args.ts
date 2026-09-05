export interface CliArgs {
  port?: number;
  host?: string;
  open: boolean;
}

function findValue(argv: readonly string[], prefix: string): string | undefined {
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

/**
 * `--port=<n>` / `--host=<h>` / `--no-open` — the `=`-form only (matching
 * `apps/evals/src/cli-args.ts`'s `--tag=`), no separate-token form, so
 * there's no lookahead ambiguity to get wrong.
 */
export function parseArgs(argv: readonly string[]): CliArgs {
  const portRaw = findValue(argv, "--port=");
  const host = findValue(argv, "--host=");
  const open = !argv.includes("--no-open");

  if (portRaw === undefined) {
    return host !== undefined ? { host, open } : { open };
  }
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port must be an integer between 0 and 65535, got "${portRaw}"`);
  }
  return host !== undefined ? { port, host, open } : { port, open };
}
