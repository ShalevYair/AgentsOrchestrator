import { REDACTED_FIELD_PATHS, createSecretRegistry, type SecretRegistry } from "@ao/platform";
import type { RedactionEvent } from "@ao/shared";

const REDACTED_MARKER = "[REDACTED]";

interface NamedPattern {
  name: string;
  pattern: RegExp;
}

/**
 * P1-T9: pattern layer. Reuses platform's `REDACTED_FIELD_PATHS` /
 * `createSecretRegistry` (see below) rather than reinventing field-name
 * redaction or the two shape patterns it already covers (Google API key,
 * Bearer token) — this adds the *content-shape* patterns egress scanning
 * needs on top: AWS, GCP/PEM private keys, OpenAI, Slack, GitHub, JWTs,
 * and generic `.env`-style `KEY=value` / `"key": "value"` assignments.
 */
const SECRET_PATTERNS: readonly NamedPattern[] = [
  { name: "google-api-key", pattern: /AIza[0-9A-Za-z_-]{35}/g },
  {
    name: "gcp-private-key-pem",
    pattern: /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g,
  },
  { name: "openai-api-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { name: "aws-access-key-id", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    name: "aws-secret-access-key",
    pattern: /(?<=aws_secret_access_key\s*[:=]\s*["']?)[A-Za-z0-9/+=]{40}/gi,
  },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}/gi },
  {
    name: "dotenv-assignment",
    pattern:
      /\b(?:api[_-]?key|secret|token|password|access[_-]?key|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{10,})["']?/gi,
  },
];

const SENSITIVE_KEY_NAMES = new Set<string>(
  [...REDACTED_FIELD_PATHS.map((p) => p.split(".").pop() ?? ""), "access_key", "private_key", "client_secret"]
    .filter((s) => s.length > 0)
    .map(normalizeKeyName),
);

function normalizeKeyName(key: string): string {
  return key.toLowerCase().replace(/[^a-z]/g, "");
}

function isSensitiveKeyName(key: string): boolean {
  return SENSITIVE_KEY_NAMES.has(normalizeKeyName(key));
}

/** Shannon entropy in bits/char — the second layer, for secrets that match no known shape. */
function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const ENTROPY_TOKEN_PATTERN = /[A-Za-z0-9+/_=-]{24,}/g;
const ENTROPY_THRESHOLD = 4.2;

export type { RedactionEvent };

export interface RedactPayloadResult<T> {
  payload: T;
  redactions: RedactionEvent[];
}

function redactString(
  value: string,
  path: string,
  registry: SecretRegistry,
  events: RedactionEvent[],
): string {
  let out = value;

  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(out)) {
      events.push({ path, pattern: name });
    }
    pattern.lastIndex = 0;
    out = out.replace(pattern, REDACTED_MARKER);
  }

  out = out.replace(ENTROPY_TOKEN_PATTERN, (token) => {
    if (token.includes("REDACTED")) return token;
    if (shannonEntropy(token) >= ENTROPY_THRESHOLD) {
      events.push({ path, pattern: "high-entropy-token" });
      return REDACTED_MARKER;
    }
    return token;
  });

  const beforeRegistry = out;
  out = registry.redact(out);
  if (out !== beforeRegistry) {
    events.push({ path, pattern: "registered-secret" });
  }

  return out;
}

function redactNode(
  node: unknown,
  path: string,
  registry: SecretRegistry,
  events: RedactionEvent[],
  keyName?: string,
): unknown {
  if (typeof node === "string") {
    if (keyName !== undefined && isSensitiveKeyName(keyName) && node.length > 0) {
      events.push({ path, pattern: "sensitive-field-name" });
      return REDACTED_MARKER;
    }
    return redactString(node, path, registry, events);
  }
  if (Array.isArray(node)) {
    return node.map((item, index) => redactNode(item, `${path}/${index}`, registry, events));
  }
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = redactNode(value, `${path}/${key}`, registry, events, key);
    }
    return out;
  }
  return node;
}

/**
 * P1-T9: scans an arbitrary outbound payload (a request body about to be
 * sent to Gemini — string, or an object/array tree of strings) for
 * secret-shaped content, replaces every match with `[REDACTED]`, and
 * returns exactly what was redacted and where — "every redaction is
 * logged/recorded" per the phase's acceptance criterion. `registry`
 * defaults to a fresh, empty one; callers that already run a shared
 * registry (e.g. the one the logger uses, so the loaded API key is caught
 * even if it leaks into free text) should pass it in explicitly so the
 * same runtime secret is caught on both logs and egress from one
 * registration.
 */
export function redactPayload<T>(
  payload: T,
  registry: SecretRegistry = createSecretRegistry(),
): RedactPayloadResult<T> {
  const events: RedactionEvent[] = [];
  const redacted = redactNode(payload, "", registry, events) as T;
  return { payload: redacted, redactions: events };
}
