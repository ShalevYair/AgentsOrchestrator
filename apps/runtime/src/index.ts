import { createLogger, createSecretRegistry, loadConfig } from "@ao/platform";
import { createKeyStore, GeminiProvider } from "@ao/providers";
import { openDb } from "./db/index.js";
import { EventHub } from "./ws/hub.js";
import { selectProvider } from "./provider/select-provider.js";
import { buildServer } from "./server.js";
import type { AppContext } from "./context.js";

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";
const SHUTDOWN_TIMEOUT_MS = 5000;

async function main(): Promise<void> {
  const config = loadConfig();
  const secretRegistry = createSecretRegistry();
  const logger = createLogger({ level: config.logLevel, registry: secretRegistry });

  const driver = openDb(config.dataDir);
  const hub = new EventHub(driver);

  const { provider, kind, model } = selectProvider({ logger, secretRegistry });
  const geminiApiKey = process.env["GEMINI_API_KEY"];
  if (geminiApiKey) secretRegistry.register(geminiApiKey);
  logger.info({ provider: kind, model }, `selected LLM provider: ${kind}`);

  let fallbackLogged = false;
  const keyStore = createKeyStore({
    dataDir: config.dataDir,
    onFallback: (error) => {
      if (!fallbackLogged) {
        fallbackLogged = true;
        logger.warn({ err: error }, "OS keyring unavailable — falling back to encrypted-file key storage");
      }
    },
  });

  const ctx: AppContext = {
    driver,
    hub,
    provider,
    providerKind: kind,
    model,
    keyStore,
    logger,
    secretRegistry,
    createValidationProvider: (apiKey) => new GeminiProvider({ apiKey }),
  };

  const app = await buildServer(ctx);
  const port = Number(process.env["AO_RUNTIME_PORT"] ?? DEFAULT_PORT);
  const host = process.env["AO_RUNTIME_HOST"] ?? DEFAULT_HOST;
  await app.listen({ port, host });
  logger.info({ port, host }, "runtime listening");

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");

    const forceExit = setTimeout(() => {
      logger.warn("shutdown exceeded timeout, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    void app
      .close()
      .catch((error: unknown) => {
        logger.error({ err: error }, "error while closing server");
      })
      .finally(() => {
        try {
          driver.close();
        } catch (error) {
          logger.error({ err: error }, "error while closing database");
        }
        clearTimeout(forceExit);
        process.exit(0);
      });
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
