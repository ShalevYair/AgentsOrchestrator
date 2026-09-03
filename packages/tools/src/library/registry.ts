import type { LocalTool } from "@ao/shared";
import {
  buildCountFilesMatchingTool,
  buildCountIdentifierOccurrencesTool,
  buildFileStatsTool,
  buildGrepTool,
  buildJsonArrayToCsvTool,
  type CountFilesMatchingParams,
  type CountIdentifierOccurrencesParams,
  type FileStatsParams,
  type GrepParams,
  type JsonArrayToCsvParams,
} from "./tools.js";

/**
 * P7-T5's "המתכנן בוחר מוכן לפני שמייצר חדש" (the planner picks a pre-built
 * tool before generating a new one) is implemented here as a **structured**
 * decision, not free-text intent classification: a caller (the planner, or
 * whatever stands in for it — `toolsmith.ts`'s `libraryTool` parameter in
 * this codebase) already knows *which* canned operation it needs and with
 * what parameters; there's no LLM call involved in matching, because
 * matching free text reliably without one isn't something this package can
 * honestly claim to do. This is a discriminated union precisely so the
 * `matchLibraryTool` switch below is exhaustively checked by the compiler —
 * a new library tool that forgets to update the switch fails to build.
 */
export type LibraryIntent =
  | { kind: "count-files-matching"; params: CountFilesMatchingParams }
  | { kind: "grep"; params: GrepParams }
  | { kind: "file-stats"; params: FileStatsParams }
  | { kind: "count-identifier-occurrences"; params: CountIdentifierOccurrencesParams }
  | { kind: "json-array-to-csv"; params: JsonArrayToCsvParams };

export function matchLibraryTool(intent: LibraryIntent): LocalTool {
  switch (intent.kind) {
    case "count-files-matching":
      return buildCountFilesMatchingTool(intent.params);
    case "grep":
      return buildGrepTool(intent.params);
    case "file-stats":
      return buildFileStatsTool(intent.params);
    case "count-identifier-occurrences":
      return buildCountIdentifierOccurrencesTool(intent.params);
    case "json-array-to-csv":
      return buildJsonArrayToCsvTool(intent.params);
  }
}
