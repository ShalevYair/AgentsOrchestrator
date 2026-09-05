import type { Logger, SecretRegistry } from "@ao/platform";
import { GeminiProvider, MockLLMProvider, WORKER_MODEL_ID } from "@ao/providers";
import type { LLMProvider } from "@ao/shared";

export interface SelectProviderOptions {
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  secretRegistry?: SecretRegistry;
  /**
   * A key previously saved via Settings (OS keychain/encrypted file,
   * P2-T7's `KeyStore`), used only when `GEMINI_API_KEY` isn't set in the
   * environment — so a key saved in an earlier session is recognized again
   * on the next startup without also requiring the env var. Pass
   * `await keyStore.get()`.
   */
  storedApiKey?: string | null;
}

export interface SelectedProvider {
  provider: LLMProvider;
  kind: "gemini" | "mock";
  model: string;
}

const MOCK_REPLY_TEXT =
  "This is a mock reply from the walking-skeleton chat pipeline — set GEMINI_API_KEY to talk to real Gemini instead.";

/**
 * Builds the `SelectedProvider` for one resolved key (or none): `GeminiProvider`
 * when `apiKey` is a non-empty string, `MockLLMProvider` otherwise. Shared by
 * `selectProvider` (below, env/stored-key resolution at startup) and
 * `routes/keys.ts` (P2-T7: a key saved or deleted through Settings swaps
 * `AppContext.provider` immediately, so the very next chat turn uses it —
 * no restart needed).
 */
export function buildProviderFor(
  apiKey: string | null | undefined,
  options: Pick<SelectProviderOptions, "logger" | "secretRegistry"> = {},
): SelectedProvider {
  if (apiKey !== undefined && apiKey !== null && apiKey.length > 0) {
    const providerOptions: ConstructorParameters<typeof GeminiProvider>[0] = { apiKey };
    if (options.secretRegistry !== undefined) providerOptions.secretRegistry = options.secretRegistry;
    if (options.logger !== undefined) providerOptions.logger = options.logger;
    return { provider: new GeminiProvider(providerOptions), kind: "gemini", model: WORKER_MODEL_ID };
  }

  return {
    provider: new MockLLMProvider({ responses: [{ text: MOCK_REPLY_TEXT, chunkCount: 12 }] }),
    kind: "mock",
    model: "gemini-3.7-flash",
  };
}

/**
 * apps/runtime is the composition root (packages/core doesn't exist until
 * P4/P5) — this is the one place a concrete LLMProvider gets picked at
 * startup. `GeminiProvider` when `GEMINI_API_KEY` is present in the
 * environment, else when a key was already saved via Settings in an earlier
 * session (`options.storedApiKey`, P2-T7's `KeyStore`); `MockLLMProvider`
 * otherwise — which is also what every dev/CI run in this repo uses since
 * no key is provisioned in that environment. The env var wins when both are
 * present (an operator-set var is the more explicit signal). This is only
 * the *startup* pick — saving/deleting a key through Settings after boot is
 * handled separately by `routes/keys.ts` calling `buildProviderFor` again.
 */
export function selectProvider(options: SelectProviderOptions = {}): SelectedProvider {
  const env = options.env ?? process.env;
  const envApiKey = env["GEMINI_API_KEY"];
  const apiKey = envApiKey !== undefined && envApiKey.length > 0 ? envApiKey : options.storedApiKey;
  return buildProviderFor(apiKey, options);
}
