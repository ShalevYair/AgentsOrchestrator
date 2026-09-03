import { z } from "zod";

/**
 * P8-T1 — the `outliner` agent's own output shape (ARCHITECTURE.md §6:
 * "שלד עם מזהים, מטרות וגדלים צפויים"). Deliberately **not** the same type
 * as `blackboard.ts`'s `OutlineSchema`/`OutlineSection`: those carry
 * `ownerTaskId`/`status`, runtime-assigned fields the outliner itself can't
 * know yet (ownership is P8-T2's job, after the skeleton exists; `status`
 * is workflow-tracking state that starts once a Task is actually running).
 * A caller (P8-T2) is expected to turn a validated `OutlineSpec` into a
 * Blackboard `Outline` by attaching those two fields per section — see
 * `packages/core/src/sharding/outline-shard.ts`.
 *
 * `deliverableKind` is per-section, not per-outline: ARCHITECTURE.md §4's
 * `DELIVERABLE_KIND_AGENT_TYPES` maps `writer` -> markdown sections and
 * `coder` -> file sections, and nothing in the docs says a single skeleton
 * can't mix both (e.g. a README section alongside several source files) —
 * so each section names which kind of owner it needs. Only `files` sections
 * carry `path`: that's the exclusive-ownership key P8-T2's sharding reuses
 * (`ShardItem.path`), and a markdown section has no file of its own.
 */
const OutlineSpecSectionFieldsSchema = {
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  /** The size the owning agent is expected to produce — P8-T1's own done-criterion requires this stay under the owning agent type's `maxOutputTokens` (writer: 12K, coder: 16K per ARCHITECTURE.md §4), checked by the caller against its own agent-registry lookup since `@ao/shared` has no opinion on agent registries. */
  expectedOutputTokens: z.number().int().positive(),
};

export const OutlineSpecSectionSchema = z.discriminatedUnion("deliverableKind", [
  z.strictObject({ ...OutlineSpecSectionFieldsSchema, deliverableKind: z.literal("markdown") }),
  z.strictObject({
    ...OutlineSpecSectionFieldsSchema,
    deliverableKind: z.literal("files"),
    path: z.string().min(1),
  }),
]);
export type OutlineSpecSection = z.infer<typeof OutlineSpecSectionSchema>;

export const OutlineSpecSchema = z.strictObject({
  id: z.string().min(1),
  sections: z.array(OutlineSpecSectionSchema).min(1),
});
export type OutlineSpec = z.infer<typeof OutlineSpecSchema>;
