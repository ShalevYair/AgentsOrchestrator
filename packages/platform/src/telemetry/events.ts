import { z } from "zod";

/**
 * P12-T7 — "ללא תוכן" (no content) enforced structurally, not by
 * convention: every variant is `z.strictObject`, so there is no field here
 * a future call site could smuggle a prompt, a file name, or any other
 * user content into without the schema itself rejecting it. Keep it that
 * way — if a new event genuinely needs a new field, it must be a small,
 * bounded enum/number/code, never free text.
 */
export const TelemetryEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("app_started"),
    timestamp: z.iso.datetime(),
    appVersion: z.string(),
    nodeMajorVersion: z.number().int().positive(),
    platform: z.enum(["win32", "darwin", "linux"]),
    providerKind: z.enum(["gemini", "mock"]),
  }),
  z.strictObject({
    type: z.literal("run_completed"),
    timestamp: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("run_failed"),
    timestamp: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
    /** A stable error code (P0-T8), e.g. "BUDGET_EXCEEDED" — never the raw error message, which can embed content. */
    errorCode: z.string(),
  }),
]);
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

/** Plain `Omit<Union, K>` would collapse the discriminated union to only its shared keys — this distributes over each member first. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** What a caller actually provides — `timestamp` is always stamped by the recorder itself, never trusted from the call site. */
export type TelemetryEventInput = DistributiveOmit<TelemetryEvent, "timestamp">;
