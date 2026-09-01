import type { Logger, SecretRegistry } from "@ao/platform";
import { GeminiProvider, MockLLMProvider, WORKER_MODEL_ID } from "@ao/providers";
import type { LLMProvider } from "@ao/shared";

export interface SelectProviderOptions {
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  secretRegistry?: SecretRegistry;
}

export interface SelectedProvider {
  provider: LLMProvider;
  kind: "gemini" | "mock";
  model: string;
}

/**
 * apps/runtime is the composition root (packages/core doesn't exist until
 * P4/P5) — this is the one place a concrete LLMProvider gets picked.
 * Per docs/TASKS.md P2: `GeminiProvider` only when `GEMINI_API_KEY` is
 * actually present in the environment at startup; `MockLLMProvider`
 * otherwise, which is also what every dev/CI run in this repo uses since
 * no key is provisioned in that environment. This is intentionally a
 * one-time, startup-only decision for the walking skeleton — settings
 * (P2-T7) can store/validate/rotate a key via the OS keychain regardless,
 * but hot-swapping the live chat provider on top of a saved key is out of
 * scope here (a real budget/session-scoped provider swap is later phases'
 * concern).
 */
export function selectProvider(options: SelectProviderOptions = {}): SelectedProvider {
  const env = options.env ?? process.env;
  const apiKey = env["GEMINI_API_KEY"];

  if (apiKey !== undefined && apiKey.length > 0) {
    const providerOptions: ConstructorParameters<typeof GeminiProvider>[0] = { apiKey };
    if (options.secretRegistry !== undefined) providerOptions.secretRegistry = options.secretRegistry;
    if (options.logger !== undefined) providerOptions.logger = options.logger;
    return { provider: new GeminiProvider(providerOptions), kind: "gemini", model: WORKER_MODEL_ID };
  }

  return {
    provider: new MockLLMProvider({
      responses: [
        {
          text: "This is a mock reply from the walking-skeleton chat pipeline — set GEMINI_API_KEY to talk to real Gemini instead.",
          chunkCount: 12,
        },
      ],
    }),
    kind: "mock",
    model: "gemini-3.7-flash",
  };
}
