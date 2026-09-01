import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, createSecretRegistry, withRunId } from "./index.js";

const SECRET = "sk-test-super-secret-key-value-0000000000";

function captureStream(): { stream: Writable; text: () => string } {
  let buffer = "";
  const stream = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      buffer += chunk.toString("utf8");
      cb();
    },
  });
  return { stream, text: () => buffer };
}

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

describe("createLogger redaction", () => {
  it.each(LEVELS)("never leaks a registered secret at level=%s, even embedded in free text", (level) => {
    const { stream, text } = captureStream();
    const registry = createSecretRegistry();
    registry.register(SECRET);
    const logger = createLogger({ level: "trace", destination: stream, registry });

    logger[level]({ apiKey: SECRET }, "structured field");
    logger[level](`free text mentioning the key directly: ${SECRET}`);

    const output = text();
    expect(output).not.toContain(SECRET);
    expect(output).toContain("[REDACTED]");
  });

  it("redacts a Google-API-key-shaped value even when it was never explicitly registered", () => {
    const { stream, text } = captureStream();
    const logger = createLogger({ level: "info", destination: stream });
    // Real Google/Gemini API keys are "AIza" + 35 chars; length matters here
    // since the redaction pattern matches that exact shape.
    const fakeKey = `AIza${"A1b2C3d4".repeat(5).slice(0, 35)}`;
    expect(fakeKey).toHaveLength(39);

    logger.error(`Gemini rejected key ${fakeKey}`);

    expect(text()).not.toContain(fakeKey);
  });

  it("redacts known field-name paths (apiKey, token, secret, authorization) via pino's fast path", () => {
    const { stream, text } = captureStream();
    const logger = createLogger({ level: "info", destination: stream });

    logger.info({ token: "abc", secret: "def", headers: { authorization: "Bearer xyz" } }, "check paths");

    const output = text();
    expect(output).not.toContain('"abc"');
    expect(output).not.toContain('"def"');
    expect(output).not.toContain("Bearer xyz");
  });

  it("does not redact ordinary log content that isn't secret-shaped", () => {
    const { stream, text } = captureStream();
    const logger = createLogger({ level: "info", destination: stream });

    logger.info("stage s1 finished with 6 tasks");

    expect(text()).toContain("stage s1 finished with 6 tasks");
  });

  it("withRunId attaches runId to every line from the child logger and still redacts", () => {
    const { stream, text } = captureStream();
    const registry = createSecretRegistry();
    registry.register(SECRET);
    const logger = createLogger({ level: "info", destination: stream, registry });
    const child = withRunId(logger, "run_abc123");

    child.info(`using key ${SECRET}`);

    const output = text();
    expect(output).toContain('"runId":"run_abc123"');
    expect(output).not.toContain(SECRET);
  });
});
