import { Writable } from "node:stream";
import { createSecretRegistry, createLogger } from "@ao/platform";
import { MockLLMProvider, type KeyStore, type MockLLMProviderOptions } from "@ao/providers";
import type { LLMProvider } from "@ao/shared";
import { resolveAgentsDir } from "../agents-dir.js";
import { resolveRecipesDir } from "../recipes-dir.js";
import { RunRegistry } from "../chat/run-registry.js";
import type { AppContext } from "../context.js";
import { openDatabase, type SqlDriver } from "../db/driver.js";
import { applyMigrations } from "../db/migrations.js";
import { EventHub } from "../ws/hub.js";

/** In-memory `KeyStore` test double — never touches the real OS keyring/encrypted file. */
export function createFakeKeyStore(): KeyStore {
  let stored: string | null = null;
  return {
    backend: "encrypted-file",
    set: (secret) => {
      stored = secret;
      return Promise.resolve();
    },
    get: () => Promise.resolve(stored),
    delete: () => {
      stored = null;
      return Promise.resolve();
    },
  };
}

export interface TestContext extends AppContext {
  driver: SqlDriver;
}

export function buildTestContext(
  dbPath: string,
  options: { mockOptions?: MockLLMProviderOptions; validationProvider?: LLMProvider } = {},
): TestContext {
  const driver = openDatabase(dbPath);
  applyMigrations(driver);
  const hub = new EventHub(driver);
  const provider = new MockLLMProvider(options.mockOptions);
  const validationProvider = options.validationProvider ?? new MockLLMProvider();

  return {
    driver,
    hub,
    provider,
    runRegistry: new RunRegistry(),
    providerKind: "mock",
    model: "gemini-3.7-flash",
    keyStore: createFakeKeyStore(),
    logger: createLogger({ destination: new Writable({ write: (_chunk, _enc, cb) => cb() }) }),
    secretRegistry: createSecretRegistry(),
    agentsDir: resolveAgentsDir({ moduleUrl: import.meta.url }),
    recipesDir: resolveRecipesDir({ moduleUrl: import.meta.url }),
    createValidationProvider: () => validationProvider,
  };
}
