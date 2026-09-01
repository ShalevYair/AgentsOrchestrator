import { Writable } from "node:stream";
import pino, { type Logger } from "pino";
import type { LogLevel } from "../config/schema.js";
import { createSecretRegistry, REDACTED_FIELD_PATHS, type SecretRegistry } from "./redaction.js";

export type { Logger } from "pino";
export { createSecretRegistry, type SecretRegistry } from "./redaction.js";

export interface CreateLoggerOptions {
  level?: LogLevel;
  /** Where finished log lines go. Defaults to stdout; tests pass an in-memory stream. */
  destination?: NodeJS.WritableStream;
  /**
   * Shared with the future egress redaction system (P1-T9) so a secret
   * registered once (the loaded API key) is caught everywhere, not just
   * in whichever subsystem happened to load it.
   */
  registry?: SecretRegistry;
}

/**
 * Wraps the real destination so every serialized log line — regardless of
 * which field a secret ended up in, including free text like an error
 * message — passes through the registry before it is ever written. Pino's
 * own `redact` option only rewrites known object paths, which is fast but
 * cannot catch a key that leaked into a message string; this stream-level
 * pass is what makes "the key never appears in logs at any level" true
 * rather than "true for the fields we thought to name".
 */
function wrapWithRedaction(target: NodeJS.WritableStream, registry: SecretRegistry): Writable {
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      target.write(registry.redact(text));
      callback();
    },
  });
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const registry = options.registry ?? createSecretRegistry();
  const destination = wrapWithRedaction(options.destination ?? process.stdout, registry);
  return pino(
    {
      level: options.level ?? "info",
      redact: { paths: [...REDACTED_FIELD_PATHS], censor: "[REDACTED]" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}

export function withRunId(logger: Logger, runId: string): Logger {
  return logger.child({ runId });
}
