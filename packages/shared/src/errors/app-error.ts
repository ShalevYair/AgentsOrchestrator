import { ERROR_MESSAGES, type ErrorCode } from "./codes.js";

export type ErrorScope =
  "config" | "provider" | "budget" | "validation" | "sandbox" | "plan" | "artifact" | "runtime";

export interface SerializedError {
  scope: ErrorScope;
  code: ErrorCode;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export interface AppErrorOptions {
  recoverable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Base of the error hierarchy. `code` is a stable identifier other code
 * (and the UI) can switch on; `message` is developer/log-facing English,
 * while the user-facing Hebrew text always comes from ERROR_MESSAGES via
 * `userMessage` / toJSON() — the two are never allowed to drift apart
 * because the UI never reads `message` directly.
 */
export class AppError extends Error {
  readonly scope: ErrorScope;
  readonly code: ErrorCode;
  readonly recoverable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(scope: ErrorScope, code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.scope = scope;
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    if (options.details !== undefined) {
      this.details = options.details;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get userMessage(): string {
    return ERROR_MESSAGES[this.code];
  }

  toJSON(): SerializedError {
    const json: SerializedError = {
      scope: this.scope,
      code: this.code,
      message: this.userMessage,
      recoverable: this.recoverable,
    };
    if (this.details !== undefined) {
      json.details = this.details;
    }
    return json;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Normalizes anything a catch block might see (AppError, a native Error
 * from a dependency, or a thrown non-Error) into the same wire shape used
 * by the `error` runtime event, so the UI never has to special-case the
 * source of a failure.
 */
export function toSerializedError(value: unknown): SerializedError {
  if (isAppError(value)) {
    return value.toJSON();
  }
  const originalMessage = value instanceof Error ? value.message : String(value);
  return {
    scope: "runtime",
    code: "INTERNAL",
    message: ERROR_MESSAGES.INTERNAL,
    recoverable: false,
    details: { originalMessage },
  };
}
