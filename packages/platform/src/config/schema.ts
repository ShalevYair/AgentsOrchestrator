import { z } from "zod";
import { expandHome } from "../paths/home.js";

export const LogLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LocaleSchema = z.enum(["he", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

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
});
export type Config = z.infer<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;
