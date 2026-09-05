import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../logging/logger.js";
import { createTelemetryRecorder, telemetryFilePath } from "./recorder.js";

function fakeLogger(): { warn: ReturnType<typeof vi.fn> } & Logger {
  return { warn: vi.fn() } as unknown as { warn: ReturnType<typeof vi.fn> } & Logger;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-telemetry-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function readEvents(dataDir: string): unknown[] {
  const raw = readFileSync(telemetryFilePath(dataDir), "utf8");
  return raw
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

describe("createTelemetryRecorder", () => {
  it("disabled: never creates the telemetry directory, never writes anything", () => {
    const recorder = createTelemetryRecorder({ enabled: false, dataDir: dir });
    expect(recorder.enabled).toBe(false);
    recorder.record({
      type: "app_started",
      appVersion: "0.1.0",
      nodeMajorVersion: 22,
      platform: "linux",
      providerKind: "mock",
    });
    expect(existsSync(join(dir, "telemetry"))).toBe(false);
  });

  it("enabled: appends a stamped, schema-valid JSONL event per record() call", () => {
    const recorder = createTelemetryRecorder({ enabled: true, dataDir: dir });
    expect(recorder.enabled).toBe(true);

    recorder.record({
      type: "app_started",
      appVersion: "0.1.0",
      nodeMajorVersion: 22,
      platform: "linux",
      providerKind: "mock",
    });
    recorder.record({ type: "run_completed", durationMs: 1234 });

    const events = readEvents(dir);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "app_started", appVersion: "0.1.0" });
    expect((events[0] as { timestamp: string }).timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(events[1]).toMatchObject({ type: "run_completed", durationMs: 1234 });
  });

  it("run_failed carries only a stable error code, never a raw message", () => {
    const recorder = createTelemetryRecorder({ enabled: true, dataDir: dir });
    recorder.record({ type: "run_failed", durationMs: 50, errorCode: "BUDGET_EXCEEDED" });
    const [event] = readEvents(dir) as [{ timestamp: string }];
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event).toMatchObject({
      type: "run_failed",
      durationMs: 50,
      errorCode: "BUDGET_EXCEEDED",
    });
  });

  it("a write failure is caught and logged, never thrown", () => {
    // A file where the telemetry *directory* should be — mkdirSync's
    // recursive create fails for a real reason (EEXIST-as-file/ENOTDIR),
    // not a mocked one, and createTelemetryRecorder must degrade to the
    // no-op recorder instead of throwing during construction.
    writeFileSync(join(dir, "telemetry"), "not a directory");

    const logger = fakeLogger();
    const recorder = createTelemetryRecorder({ enabled: true, dataDir: dir, logger });
    expect(() => {
      recorder.record({ type: "run_completed", durationMs: 1 });
    }).not.toThrow();
    expect(recorder.enabled).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("a write failure *inside* record() (directory ok, the file path itself isn't) is caught and logged, never thrown", () => {
    // The parent directory exists, but events.jsonl is itself a directory —
    // appendFileSync fails for a real EISDIR, exercising record()'s own
    // try/catch specifically (unlike the test above, construction succeeds).
    mkdirSync(telemetryFilePath(dir), { recursive: true });

    const logger = fakeLogger();
    const recorder = createTelemetryRecorder({ enabled: true, dataDir: dir, logger });
    expect(() => {
      recorder.record({ type: "run_completed", durationMs: 1 });
    }).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });
});
