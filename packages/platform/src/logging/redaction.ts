/**
 * Shapes of known secret formats, redacted regardless of whether the
 * actual runtime secret was ever registered — a defense-in-depth net for
 * values that leak into free text (an error message, a stack trace).
 */
const KNOWN_SHAPE_PATTERNS: readonly RegExp[] = [
  /AIza[0-9A-Za-z_-]{35}/g, // Google/Gemini API key shape
  /\bBearer\s+[A-Za-z0-9._-]{16,}/gi,
];

const MIN_SECRET_LENGTH = 6;

export interface SecretRegistry {
  /** Marks a concrete runtime value (e.g. the loaded Gemini API key) as secret. */
  register(secret: string): void;
  /** Replaces every occurrence of every registered secret, plus known secret shapes, with a fixed marker. */
  redact(text: string): string;
}

export function createSecretRegistry(): SecretRegistry {
  const secrets = new Set<string>();
  return {
    register(secret: string) {
      if (secret.length >= MIN_SECRET_LENGTH) {
        secrets.add(secret);
      }
    },
    redact(text: string) {
      let out = text;
      for (const secret of secrets) {
        out = out.split(secret).join("[REDACTED]");
      }
      for (const pattern of KNOWN_SHAPE_PATTERNS) {
        out = out.replace(pattern, "[REDACTED]");
      }
      return out;
    },
  };
}

/** Pino path-based redaction for well-known field names — fast, exact, no scanning required. */
export const REDACTED_FIELD_PATHS: readonly string[] = [
  "apiKey",
  "*.apiKey",
  "*.*.apiKey",
  "config.apiKey",
  "password",
  "*.password",
  "token",
  "*.token",
  "secret",
  "*.secret",
  "headers.authorization",
  "*.headers.authorization",
  "req.headers.authorization",
];
