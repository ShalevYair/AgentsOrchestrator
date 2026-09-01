import { z } from "zod";

/** The closed registry of merge strategies from PROTOCOLS.md §8. */
export const ReducerIdSchema = z.enum([
  "local:concat-ordered",
  "local:dedupe-findings",
  "local:vote",
  "local:assemble-files",
  "local:reduce-tree",
  "llm:synthesize",
]);
export type ReducerId = z.infer<typeof ReducerIdSchema>;

export function isLlmReducer(id: ReducerId): boolean {
  return id.startsWith("llm:");
}
