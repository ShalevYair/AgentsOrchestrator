import { ProviderKeyError, type LLMProvider, type ModelInfo } from "@ao/shared";

/**
 * P1-T4: a live check against `models.list()` — not a format check on the
 * key string, and not a guess from an HTTP status code alone. Every
 * failure path (network error, 401/403 from the API, an empty catalog)
 * comes back as the same `ProviderKeyError` (code `PROVIDER_KEY_INVALID`,
 * already defined in `packages/shared/src/errors`), whose `userMessage` is
 * always the fixed Hebrew text from `ERROR_MESSAGES` — never the raw
 * underlying error's stack trace or message, which is preserved only in
 * `details.originalMessage` for logs.
 */
export async function validateApiKey(provider: LLMProvider): Promise<ModelInfo[]> {
  let models: ModelInfo[];
  try {
    models = await provider.models();
  } catch (error) {
    throw new ProviderKeyError("Gemini API key validation failed: models.list() rejected", {
      recoverable: false,
      cause: error,
      details: { originalMessage: error instanceof Error ? error.message : String(error) },
    });
  }
  if (models.length === 0) {
    throw new ProviderKeyError("Gemini API key validation failed: models.list() returned no models", {
      recoverable: false,
    });
  }
  return models;
}
