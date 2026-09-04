import { z } from "zod";

/**
 * The reducer ids PROTOCOLS.md §8 ships built in — pre-registered by
 * `@ao/core`'s `createReducerRegistry` (P10-T6), and the closed list this
 * *used* to be before P10-T6 opened `ReducerIdSchema` up for extension.
 * Kept as a plain array (not the schema itself) so tooling/docs can still
 * ask "what ships built in" without that being the same question as "what
 * is a syntactically valid mergeStrategy" — those stopped being the same
 * question the moment reducers became pluggable.
 */
export const BUILTIN_REDUCER_IDS = [
  "local:concat-ordered",
  "local:dedupe-findings",
  "local:vote",
  "local:assemble-files",
  "local:reduce-tree",
  "llm:synthesize",
] as const;
export type BuiltinReducerId = (typeof BUILTIN_REDUCER_IDS)[number];

/**
 * P10-T6 — `Stage.mergeStrategy`'s id is open, the same way `Stage.agentType`
 * already was: any non-empty string, not just the built-in ones. A custom
 * reducer registers into `@ao/core`'s `createReducerRegistry` under
 * whatever id it likes; validity beyond "is this a real string" is
 * `validatePlan`'s V9 (`knownReducerIds`, packages/core/plan/validate.ts) —
 * the exact split V3 already draws for `agentType` against
 * `knownAgentTypes`, not a second, differently-shaped mechanism invented
 * just for reducers.
 */
export const ReducerIdSchema = z.string().min(1);
export type ReducerId = z.infer<typeof ReducerIdSchema>;

export function isLlmReducer(id: ReducerId): boolean {
  return id.startsWith("llm:");
}
