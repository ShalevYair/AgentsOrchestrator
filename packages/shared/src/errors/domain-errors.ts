import { AppError, type AppErrorOptions } from "./app-error.js";

export class ConfigError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("config", "CONFIG_INVALID", message, { recoverable: false, ...options });
  }
}

export class ProviderError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("provider", "PROVIDER_REQUEST_FAILED", message, { recoverable: true, ...options });
  }
}

export class ProviderKeyError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("provider", "PROVIDER_KEY_INVALID", message, { recoverable: false, ...options });
  }
}

export class ProviderRateLimitError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("provider", "PROVIDER_RATE_LIMITED", message, { recoverable: true, ...options });
  }
}

export class BudgetExceededError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("budget", "BUDGET_EXCEEDED", message, { recoverable: true, ...options });
  }
}

export class BudgetReserveLockedError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("budget", "BUDGET_RESERVE_LOCKED", message, { recoverable: false, ...options });
  }
}

export class SchemaValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("validation", "SCHEMA_VALIDATION_FAILED", message, { recoverable: true, ...options });
  }
}

export class SandboxViolationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("sandbox", "SANDBOX_VIOLATION", message, { recoverable: false, ...options });
  }
}

export class SandboxTimeoutError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("sandbox", "SANDBOX_TIMEOUT", message, { recoverable: true, ...options });
  }
}

export class PlanInvalidError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("plan", "PLAN_INVALID", message, { recoverable: true, ...options });
  }
}

export class PlanPatchRejectedError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("plan", "PLAN_PATCH_REJECTED", message, { recoverable: true, ...options });
  }
}

export class ArtifactPathError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("artifact", "ARTIFACT_PATH_REJECTED", message, { recoverable: false, ...options });
  }
}

export class ArtifactHashMismatchError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("artifact", "ARTIFACT_HASH_MISMATCH", message, { recoverable: true, ...options });
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("runtime", "NOT_FOUND", message, { recoverable: false, ...options });
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("runtime", "TIMEOUT", message, { recoverable: true, ...options });
  }
}
