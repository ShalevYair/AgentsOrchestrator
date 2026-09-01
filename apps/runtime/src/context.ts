import type { Logger, SecretRegistry } from "@ao/platform";
import type { KeyStore } from "@ao/providers";
import type { LLMProvider } from "@ao/shared";
import type { SqlDriver } from "./db/driver.js";
import type { EventHub } from "./ws/hub.js";

/** Everything a route handler needs — assembled once at startup (apps/runtime is the composition root; packages/core doesn't exist yet). */
export interface AppContext {
  driver: SqlDriver;
  hub: EventHub;
  provider: LLMProvider;
  providerKind: "gemini" | "mock";
  model: string;
  keyStore: KeyStore;
  logger: Logger;
  secretRegistry: SecretRegistry;
  /**
   * How `routes/keys.ts` builds the throwaway provider it validates a
   * submitted key against — defaults to a real `GeminiProvider` in
   * `server.ts`. Overridable so tests can validate the route's behavior
   * (store on success, 422 on failure, masking, backend reporting)
   * without any real network call, per this repo's "zero LLM/network
   * calls in unit tests" rule.
   */
  createValidationProvider: (apiKey: string) => LLMProvider;
}
