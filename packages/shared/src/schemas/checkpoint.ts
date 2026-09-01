import { z } from "zod";

const JsonPointerSchema = z
  .string()
  .regex(/^\/(?:[^~/]|~0|~1)*(?:\/(?:[^~/]|~0|~1)*)*$/, "expected an RFC 6901 JSON Pointer");

/** Full RFC 6902 JSON Patch operation union — PROTOCOLS.md §6 names the RFC explicitly. */
export const JsonPatchOperationSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("add"), path: JsonPointerSchema, value: z.unknown() }),
  z.strictObject({ op: z.literal("remove"), path: JsonPointerSchema }),
  z.strictObject({ op: z.literal("replace"), path: JsonPointerSchema, value: z.unknown() }),
  z.strictObject({ op: z.literal("move"), path: JsonPointerSchema, from: JsonPointerSchema }),
  z.strictObject({ op: z.literal("copy"), path: JsonPointerSchema, from: JsonPointerSchema }),
  z.strictObject({ op: z.literal("test"), path: JsonPointerSchema, value: z.unknown() }),
]);
export type JsonPatchOperation = z.infer<typeof JsonPatchOperationSchema>;

export const CheckpointDecisionKindSchema = z.enum(["continue", "amend", "replan", "stop"]);
export type CheckpointDecisionKind = z.infer<typeof CheckpointDecisionKindSchema>;

/** The output contract of the `checkpoint` agent (PROTOCOLS.md §6). */
export const CheckpointDecisionSchema = z.strictObject({
  decision: CheckpointDecisionKindSchema,
  reason: z.string().min(1),
  patch: z.array(JsonPatchOperationSchema),
  confidence: z.number().min(0).max(1),
});
export type CheckpointDecision = z.infer<typeof CheckpointDecisionSchema>;

/**
 * Path-shape allowlist from PROTOCOLS.md §6. This only approves the
 * *location* a patch touches, not the direction or content of the change —
 * e.g. tokenBudget/hardCap may only move downward (or draw from
 * repairTokens), and a whole-stage add/remove is only valid when that
 * stage is `optional`. Those value-level checks need the current Plan
 * document in hand and belong to the patch-application logic in P6-T3,
 * not this pure path predicate. A path that doesn't match here is
 * rejected outright; one that matches still needs that second check.
 */
const ALLOWED_PATCH_PATH_PATTERNS: readonly RegExp[] = [
  /^\/stages\/\d+\/fanout\/count$/,
  /^\/stages\/\d+\/fanout\/maxParallel$/,
  /^\/stages\/\d+\/contextBudget(\/.*)?$/,
  /^\/stages\/\d+\/tokenBudget\/hardCap$/,
  /^\/stages\/\d+\/agentType$/,
  /^\/stages\/\d+$/,
];

export function isPatchPathAllowed(path: string): boolean {
  return ALLOWED_PATCH_PATH_PATTERNS.some((pattern) => pattern.test(path));
}
