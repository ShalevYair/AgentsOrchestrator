import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "../logging/logger.js";
import { TelemetryEventSchema, type TelemetryEventInput } from "./events.js";

export interface TelemetryRecorder {
  readonly enabled: boolean;
  record(event: TelemetryEventInput): void;
}

const NOOP_RECORDER: TelemetryRecorder = { enabled: false, record: () => undefined };

export interface CreateTelemetryRecorderOptions {
  enabled: boolean;
  dataDir: string;
  logger?: Logger;
}

/** `<dataDir>/telemetry/events.jsonl` — same append-only JSONL shape as `evals/history.jsonl` (P11). */
export function telemetryFilePath(dataDir: string): string {
  return join(dataDir, "telemetry", "events.jsonl");
}

/**
 * Off by default (P12-T7) — when disabled this is a true no-op that never
 * touches disk, not just an empty log. When enabled, a write failure (full
 * disk, permissions) is caught and logged, never thrown: telemetry must
 * never be the reason a real feature breaks.
 */
export function createTelemetryRecorder(options: CreateTelemetryRecorderOptions): TelemetryRecorder {
  if (!options.enabled) return NOOP_RECORDER;

  const filePath = telemetryFilePath(options.dataDir);
  try {
    mkdirSync(join(options.dataDir, "telemetry"), { recursive: true });
  } catch (error) {
    options.logger?.warn(
      { err: error },
      "telemetry: could not create telemetry directory — disabling for this run",
    );
    return NOOP_RECORDER;
  }

  return {
    enabled: true,
    record(input) {
      const result = TelemetryEventSchema.safeParse({ ...input, timestamp: new Date().toISOString() });
      if (!result.success) {
        options.logger?.warn(
          { issues: result.error.issues, type: input.type },
          "telemetry: dropped a malformed event",
        );
        return;
      }
      try {
        appendFileSync(filePath, `${JSON.stringify(result.data)}\n`, "utf8");
      } catch (error) {
        options.logger?.warn({ err: error }, "telemetry: failed to write event — continuing without it");
      }
    },
  };
}
