import { createSecretRegistry } from "@ao/platform";
import { describe, expect, it } from "vitest";
import { redactPayload } from "./redact-payload.js";

// Fake-but-shape-correct secrets. None of these are real credentials.
const CORPUS: Record<string, string> = {
  "Google/Gemini API key": "AIzaSyD-9tbanRKq0S8dr8dJHqOI4nfKfrKzKI8",
  "OpenAI API key": "sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD",
  "OpenAI project-scoped key": "sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGH_012345",
  "AWS access key id": "AKIAIOSFODNN7EXAMPLE",
  "AWS secret access key (.env-shaped)": "aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "GCP service-account private key (PEM)":
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw\n-----END PRIVATE KEY-----",
  // Deliberately not a realistic Slack-token-shaped value (GitHub's own push
  // protection flags the realistic numeric-segment shape even for test
  // fixtures) — this still exercises the same regex, since it only requires
  // length/charset after the "xoxb-" prefix, not Slack's real segment structure.
  "Slack bot token": "xoxb-FAKE-TEST-TOKEN-DO-NOT-USE-NOT-REAL",
  "GitHub personal access token": "ghp_1234567890abcdefghijklmnopqrstuvwxyz12",
  JWT: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  "Bearer authorization header": "Bearer eyxyz1234567890abcdefghijklmnop",
  ".env-shaped generic secret line": 'password="Sup3rSecretPassw0rd!!"',
  "high-entropy token with no known shape": "kQ8x2ZpL9mR4vT7nJ1wY6bC3dF0gH5sE8aU2iO9k",
};

describe("redactPayload — zero-false-negative corpus", () => {
  it.each(Object.entries(CORPUS))("catches a %s embedded in free text", (_label, secret) => {
    const { payload, redactions } = redactPayload(`here is some context: ${secret} -- end of context`);
    expect(payload).not.toContain(secret);
    expect(redactions.length).toBeGreaterThan(0);
  });

  it.each(Object.entries(CORPUS))("catches a %s as a nested object field value", (_label, secret) => {
    const { payload, redactions } = redactPayload({
      request: { messages: [{ role: "user", text: `token: ${secret}` }] },
    });
    expect(JSON.stringify(payload)).not.toContain(secret);
    expect(redactions.length).toBeGreaterThan(0);
    expect(redactions[0]?.path).toContain("/request/messages/0/text");
  });
});

describe("redactPayload — field-name-based redaction", () => {
  it("redacts a value under a sensitive key name regardless of its shape", () => {
    const { payload, redactions } = redactPayload({ apiKey: "not-shaped-like-anything-special" });
    expect(payload.apiKey).toBe("[REDACTED]");
    expect(redactions).toEqual([{ path: "/apiKey", pattern: "sensitive-field-name" }]);
  });

  it("redacts nested authorization headers", () => {
    const { payload } = redactPayload({ headers: { authorization: "Bearer abc" } });
    expect(payload.headers.authorization).toBe("[REDACTED]");
  });
});

describe("redactPayload — registered runtime secret", () => {
  it("catches the concrete loaded API key even when it matches no known shape pattern", () => {
    const registry = createSecretRegistry();
    const arbitrarySecret = "this-is-not-shaped-like-a-known-provider-key-at-all";
    registry.register(arbitrarySecret);

    const { payload, redactions } = redactPayload(`error: rejected key ${arbitrarySecret}`, registry);
    expect(payload).not.toContain(arbitrarySecret);
    expect(redactions.some((r) => r.pattern === "registered-secret")).toBe(true);
  });
});

describe("redactPayload — no false positives on ordinary content", () => {
  it("leaves plain prose, code, and short identifiers untouched", () => {
    const ordinary = {
      objective: "נתח את המאגר וכתוב מסמך ארכיטקטורה",
      stageId: "s1",
      code: "export function add(a: number, b: number) { return a + b; }",
      count: 42,
    };
    const { payload, redactions } = redactPayload(ordinary);
    expect(payload).toEqual(ordinary);
    expect(redactions).toEqual([]);
  });
});

describe("redactPayload — recursion and structure", () => {
  it("walks arrays and deeply nested objects", () => {
    const { redactions } = redactPayload({
      a: [{ b: { c: "AIzaSyD-9tbanRKq0S8dr8dJHqOI4nfKfrKzKI8" } }],
    });
    expect(redactions[0]?.path).toBe("/a/0/b/c");
  });

  it("preserves non-string, non-object values untouched (numbers, booleans, null)", () => {
    const { payload } = redactPayload({ n: 1, b: true, x: null });
    expect(payload).toEqual({ n: 1, b: true, x: null });
  });
});
