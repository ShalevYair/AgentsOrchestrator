import { z } from "zod";
import { expandHome } from "../paths/home.js";

export const LogLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LocaleSchema = z.enum(["he", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

/**
 * P12-T7: opt-in only, so the safe default on *any* unrecognized input is
 * `false` — a config-file boolean passes through unchanged, but an env var
 * (always a string) only turns it on for the exact string `"true"`.
 * Deliberately not `z.coerce.boolean()`: `Boolean("false")` is `true`, which
 * would silently invert an env var meant to disable this.
 */
const TelemetryEnabledSchema = z.preprocess(
  (value) => (typeof value === "string" ? value === "true" : value),
  z.boolean(),
);

/**
 * Root platform configuration. Deliberately small in P0: only the settings
 * this phase itself needs. Later phases extend this object with their own
 * fields (provider/model settings in P1, budget defaults in P4, sandbox
 * settings in P7) rather than inventing a second config mechanism.
 */
export const ConfigSchema = z.strictObject({
  logLevel: LogLevelSchema.default("info"),
  locale: LocaleSchema.default("he"),
  dataDir: z.string().min(1).transform(expandHome),
  /** P12-T7 — off by default; see docs/TELEMETRY.md for exactly what this turns on. */
  telemetryEnabled: TelemetryEnabledSchema.default(false),
});
export type Config = z.infer<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;
