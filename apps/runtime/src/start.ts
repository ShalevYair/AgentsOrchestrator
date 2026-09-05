import {
  createLogger,
  createSecretRegistry,
  createTelemetryRecorder,
  loadConfig,
  type Logger,
} from "@ao/platform";
import { createKeyStore, GeminiProvider } from "@ao/providers";
import { checkEnvironment } from "@ao/tools";
import { resolveAgentsDir } from "./agents-dir.js";
import { resolveRecipesDir } from "./recipes-dir.js";
import { RunRegistry } from "./chat/run-registry.js";
import { openDb } from "./db/index.js";
import { EventHub } from "./ws/hub.js";
import { selectProvider } from "./provider/select-provider.js";
import { buildServer } from "./server.js";
import type { AppContext } from "./context.js";

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";
const SHUTDOWN_TIMEOUT_MS = 5000;
/**
 * Not read from package.json at runtime on purpose: once bundled into
 * apps/cli (P12-T1), this file's own package.json doesn't exist at the
 * bundled location, and reading `apps/runtime/package.json` by a relative
 * path would silently break the same way `agents`/`recipes` dir resolution
 * would have without the AO_AGENTS_DIR/AO_RECIPES_DIR override. Bump this
 * alongside the real package.json versions at release time (P12-T8).
 */
const APP_VERSION = "0.1.0";

export interface StartRuntimeOptions {
  /** Defaults to `AO_RUNTIME_PORT` env, then 8787. `0` always means "OS picks a free port". */
  port?: number;
  host?: string;
  /** P12-T1 — serves the built web UI from here at `/` (see `BuildServerOptions`). */
  staticDir?: string;
  /** Overrides `AO_DATA_DIR`/the `~/.agents-orchestrator` default — same precedence as any other `loadConfig` UI override. */
  dataDir?: string;
}

export interface RunningRuntime {
  port: number;
  host: string;
  logger: Logger;
  /** Idempotent — a second call is a no-op, matching the original SIGINT/SIGTERM handler's guard. */
  shutdown: (signal?: string) => Promise<void>;
}

function isAddrInUse(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EADDRINUSE";
}

/**
 * P12-T1's "בחירת פורט פנוי" (free port selection): try the requested port
 * first (so `AO_RUNTIME_PORT`/the 8787 default still works normally), and
 * only fall back to an OS-assigned ephemeral port (`port: 0`) on a real
 * collision — never silently picks a random port when the requested one
 * was actually free.
 */
async function listenOnAvailablePort(
  app: Awaited<ReturnType<typeof buildServer>>,
  port: number,
  host: string,
): Promise<number> {
  try {
    await app.listen({ port, host });
  } catch (error) {
    if (!isAddrInUse(error) || port === 0) throw error;
    await app.listen({ port: 0, host });
  }
  const address = app.server.address();
  if (address === null || typeof address === "string") {
    throw new Error(`unexpected server address after listen(): ${JSON.stringify(address)}`);
  }
  return address.port;
}

/**
 * Everything `apps/runtime`'s own `index.ts` needs to become a running
 * server, extracted so `apps/cli` (P12-T1) can start the exact same
 * composition in-process — no child process, no port-guessing — and learn
 * the *actual* bound port back (needed to open the browser at the right
 * URL after a free-port fallback).
 */
export async function startRuntime(options: StartRuntimeOptions = {}): Promise<RunningRuntime> {
  const config = loadConfig(
    options.dataDir !== undefined ? { uiOverrides: { dataDir: options.dataDir } } : {},
  );
  const secretRegistry = createSecretRegistry();
  const logger = createLogger({ level: config.logLevel, registry: secretRegistry });

  // P12-T2: probed once at startup and logged — never blocks boot. A missing
  // Python only disables script-running tools (with an explanation); running
  // without Docker only means the real (possibly partial) native sandbox
  // isolation applies, which `environment.sandbox.notes` spells out.
  const environment = checkEnvironment();
  logger.info({ environment }, "environment check");
  if (!environment.python.ok) {
    logger.warn(
      { installInstructions: environment.python.installInstructions },
      "Python not available — local script tools will be disabled",
    );
  }
  if (!environment.docker.available && environment.sandbox.notes.length > 0) {
    logger.warn(
      { sandbox: environment.sandbox },
      "running without Docker — local tool sandboxing is only partially isolated",
    );
  }

  const driver = openDb(config.dataDir);
  const hub = new EventHub(driver);

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

  // A key saved via Settings in an earlier session (P2-T7) is recognized on
  // this startup too, not just a GEMINI_API_KEY env var — see
  // select-provider.ts's `storedApiKey` precedence.
  const storedApiKey = await keyStore.get();
  const { provider, kind, model } = selectProvider({ logger, secretRegistry, storedApiKey });
  const geminiApiKey = process.env["GEMINI_API_KEY"];
  if (geminiApiKey) secretRegistry.register(geminiApiKey);
  logger.info({ provider: kind, model }, `selected LLM provider: ${kind}`);

  const agentsDir = resolveAgentsDir({ moduleUrl: import.meta.url });
  const recipesDir = resolveRecipesDir({ moduleUrl: import.meta.url });
  logger.info({ agentsDir, recipesDir }, "resolved agents/recipes directories");

  const telemetry = createTelemetryRecorder({
    enabled: config.telemetryEnabled,
    dataDir: config.dataDir,
    logger,
  });
  logger.info(
    { telemetryEnabled: telemetry.enabled },
    "telemetry: opt-in, off by default (see docs/TELEMETRY.md)",
  );
  const nodeMajorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10) || 0;
  telemetry.record({
    type: "app_started",
    appVersion: APP_VERSION,
    nodeMajorVersion,
    platform: process.platform === "win32" || process.platform === "darwin" ? process.platform : "linux",
    providerKind: kind,
  });

  const ctx: AppContext = {
    driver,
    hub,
    provider,
    runRegistry: new RunRegistry(),
    providerKind: kind,
    model,
    keyStore,
    logger,
    secretRegistry,
    agentsDir,
    recipesDir,
    telemetry,
    createValidationProvider: (apiKey) => new GeminiProvider({ apiKey }),
  };

  const app = await buildServer(ctx, options.staticDir !== undefined ? { staticDir: options.staticDir } : {});
  const requestedPort = options.port ?? Number(process.env["AO_RUNTIME_PORT"] ?? DEFAULT_PORT);
  const host = options.host ?? process.env["AO_RUNTIME_HOST"] ?? DEFAULT_HOST;
  const port = await listenOnAvailablePort(app, requestedPort, host);
  logger.info({ port, host, requestedPort }, "runtime listening");

  let shuttingDown = false;
  const shutdown = async (signal = "manual"): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");

    const forceExit = setTimeout(() => {
      logger.warn("shutdown exceeded timeout, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await app.close();
    } catch (error) {
      logger.error({ err: error }, "error while closing server");
    }
    try {
      driver.close();
    } catch (error) {
      logger.error({ err: error }, "error while closing database");
    }
    clearTimeout(forceExit);
  };

  return { port, host, logger, shutdown };
}
