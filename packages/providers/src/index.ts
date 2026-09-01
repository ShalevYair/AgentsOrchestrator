// P1 — Gemini provider + key management (docs/TASKS.md §P1).
// `@ao/providers` is a leaf package: it depends on @ao/shared and @ao/platform,
// never the other way around, and never on a (not-yet-built) @ao/core.

export {
  MODEL_REGISTRY,
  WORKER_MODEL_ID,
  CHEAP_FALLBACK_MODEL_ID,
  DEFAULT_SYNTH_MODEL_ID,
  resolveModelEntry,
  parseModelVersion,
  selectCheapModel,
  validateModelRegistry,
  type ModelRegistryEntry,
  type ModelPricing,
  type ModelCapabilities,
  type CheapModelSelection,
  type ModelRegistryValidation,
} from "./models.js";

export {
  MockLLMProvider,
  type MockGenerateResponse,
  type MockLLMProviderOptions,
  type MockLLMProviderCalls,
} from "./mock/mock-provider.js";

export { GeminiProvider, type GeminiProviderOptions } from "./gemini/gemini-provider.js";
export { createGeminiSdkClient, type GeminiSdkClient } from "./gemini/client.js";
export { toGeminiSchema, type GeminiSchema, type GeminiType } from "./gemini/schema-dialect.js";
export { normalizeUsage } from "./gemini/usage.js";

export {
  createKeyStore,
  OsKeyringStore,
  type KeyStore,
  type KeyStoreBackend,
  type CreateKeyStoreOptions,
} from "./keyring/key-store.js";
export { EncryptedFileKeyStore } from "./keyring/encrypted-file-store.js";

export { validateApiKey } from "./validation/validate-key.js";

export {
  withRetry,
  extractRetryDelayMs,
  type RetryOptions,
  type RetryClassification,
} from "./resilience/retry.js";
export { RateLimiter, type RateLimiterOptions } from "./resilience/rate-limiter.js";
export { ConcurrencyLimiter } from "./resilience/concurrency-limiter.js";

export {
  ResponseCache,
  hashCacheKey,
  type ResponseCacheOptions,
  type ResponseCacheStats,
  type ResponseCacheKeyInput,
} from "./cache/response-cache.js";

export { ContractCache, type ContractCacheStats } from "./context-cache/contract-cache.js";

export { redactPayload, type RedactionEvent, type RedactPayloadResult } from "./egress/redact-payload.js";
