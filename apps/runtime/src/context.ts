import type { Logger, SecretRegistry } from "@ao/platform";
import type { KeyStore } from "@ao/providers";
import type { LLMProvider } from "@ao/shared";
import type { RunRegistry } from "./chat/run-registry.js";
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
  /** P9-T11: in-flight runs' `AbortController`s, keyed by runId — how `POST /api/runs/:id/stop` reaches a `runChatTurn` call happening on a different request. */
  runRegistry: RunRegistry;
  /**
   * The `agents/` directory PROTOCOLS.md §10 describes (`resolveAgentsDir`,
   * P10-T1). A plain path, not a pre-loaded registry snapshot — every real
   * read goes through `@ao/platform`'s `loadAgent`/`listAgentTypes` fresh,
   * per call, so an edited `agent.md` takes effect on the very next call
   * with nothing here to invalidate (P10-T2's hot reload).
   */
  agentsDir: string;
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
