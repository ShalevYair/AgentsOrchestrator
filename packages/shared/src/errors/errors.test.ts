import { describe, expect, it } from "vitest";
import { ERROR_CODES, ERROR_MESSAGES } from "./codes.js";
import { isAppError, toSerializedError } from "./app-error.js";
import {
  ArtifactHashMismatchError,
  ArtifactPathError,
  BudgetExceededError,
  BudgetReserveLockedError,
  ConfigError,
  NotFoundError,
  PlanInvalidError,
  PlanPatchRejectedError,
  ProviderError,
  ProviderKeyError,
  ProviderRateLimitError,
  SandboxTimeoutError,
  SandboxViolationError,
  SchemaValidationError,
  TimeoutError,
} from "./domain-errors.js";

describe("error code registry", () => {
  it("has a Hebrew user message for every declared code", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGES[code], `missing message for ${code}`).toBeTruthy();
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });

  it("has no stray messages for codes that were removed", () => {
    const declared = new Set<string>(ERROR_CODES);
    for (const key of Object.keys(ERROR_MESSAGES)) {
      expect(declared.has(key)).toBe(true);
    }
  });
});

describe("AppError", () => {
  it("carries a stable code and derives the Hebrew message from the registry, not the log message", () => {
    const err = new ConfigError("missing GEMINI_API_KEY in environment");
    expect(err.code).toBe("CONFIG_INVALID");
    expect(err.scope).toBe("config");
    expect(err.userMessage).toBe(ERROR_MESSAGES.CONFIG_INVALID);
    expect(err.message).toBe("missing GEMINI_API_KEY in environment");
    expect(err.userMessage).not.toBe(err.message);
  });

  it("serializes to the runtime error-event shape", () => {
    const err = new BudgetExceededError("stage 2 projected 480K over the 300K hard cap", {
      details: { stageId: "s2", projected: 480_000, hardCap: 300_000 },
    });
    const json = err.toJSON();
    expect(json).toEqual({
      scope: "budget",
      code: "BUDGET_EXCEEDED",
      message: ERROR_MESSAGES.BUDGET_EXCEEDED,
      recoverable: true,
      details: { stageId: "s2", projected: 480_000, hardCap: 300_000 },
    });
  });

  it("omits `details` entirely when none were given, rather than serializing undefined", () => {
    const json = new NotFoundError("no such run").toJSON();
    expect("details" in json).toBe(false);
  });

  it("is a real Error instance usable with instanceof and try/catch, and keeps the cause chain", () => {
    const cause = new Error("ECONNRESET");
    const err = new ProviderError("request to Gemini failed", { cause });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("ProviderError");
  });

  it.each([
    ["ConfigError", () => new ConfigError("x"), "CONFIG_INVALID", false],
    ["ProviderError", () => new ProviderError("x"), "PROVIDER_REQUEST_FAILED", true],
    ["ProviderKeyError", () => new ProviderKeyError("x"), "PROVIDER_KEY_INVALID", false],
    ["ProviderRateLimitError", () => new ProviderRateLimitError("x"), "PROVIDER_RATE_LIMITED", true],
    ["BudgetExceededError", () => new BudgetExceededError("x"), "BUDGET_EXCEEDED", true],
    ["BudgetReserveLockedError", () => new BudgetReserveLockedError("x"), "BUDGET_RESERVE_LOCKED", false],
    ["SchemaValidationError", () => new SchemaValidationError("x"), "SCHEMA_VALIDATION_FAILED", true],
    ["SandboxViolationError", () => new SandboxViolationError("x"), "SANDBOX_VIOLATION", false],
    ["SandboxTimeoutError", () => new SandboxTimeoutError("x"), "SANDBOX_TIMEOUT", true],
    ["PlanInvalidError", () => new PlanInvalidError("x"), "PLAN_INVALID", true],
    ["PlanPatchRejectedError", () => new PlanPatchRejectedError("x"), "PLAN_PATCH_REJECTED", true],
    ["ArtifactPathError", () => new ArtifactPathError("x"), "ARTIFACT_PATH_REJECTED", false],
    ["ArtifactHashMismatchError", () => new ArtifactHashMismatchError("x"), "ARTIFACT_HASH_MISMATCH", true],
    ["NotFoundError", () => new NotFoundError("x"), "NOT_FOUND", false],
    ["TimeoutError", () => new TimeoutError("x"), "TIMEOUT", true],
  ] as const)("%s carries code %s and recoverable=%s", (_name, make, code, recoverable) => {
    const err = make();
    expect(err.code).toBe(code);
    expect(err.recoverable).toBe(recoverable);
  });

  it("lets a caller override the default recoverable flag when the situation warrants it", () => {
    const err = new ConfigError("recoverable via UI prompt", { recoverable: true });
    expect(err.recoverable).toBe(true);
  });
});

describe("toSerializedError", () => {
  it("passes an AppError through as-is", () => {
    const err = new ArtifactPathError("path escapes staging root");
    expect(toSerializedError(err)).toEqual(err.toJSON());
  });

  it("wraps a plain Error as INTERNAL without leaking its raw message as the user-facing text", () => {
    const serialized = toSerializedError(new Error("ENOENT: no such file"));
    expect(serialized.code).toBe("INTERNAL");
    expect(serialized.scope).toBe("runtime");
    expect(serialized.message).toBe(ERROR_MESSAGES.INTERNAL);
    expect(serialized.details?.["originalMessage"]).toBe("ENOENT: no such file");
  });

  it("wraps a non-Error throw (string, object) without crashing", () => {
    expect(toSerializedError("boom").details?.["originalMessage"]).toBe("boom");
    expect(toSerializedError({ weird: true }).code).toBe("INTERNAL");
  });
});

describe("isAppError", () => {
  it("distinguishes AppError from a native Error", () => {
    expect(isAppError(new ConfigError("x"))).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError("x")).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});
