import { startRuntime } from "./start.js";

/**
 * apps/runtime's actual process entry point (see package.json's
 * `start`/`dev` scripts) — always runs unconditionally, no "am I really
 * the entry point" guard needed, because unlike `index.ts` this file is
 * never imported as a library by anything (see `index.ts`'s own comment
 * for why that guard broke under bundling and was removed from there).
 */
async function main(): Promise<void> {
  const { port, host, logger, shutdown } = await startRuntime();
  logger.info({ port, host }, "runtime ready");

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

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
