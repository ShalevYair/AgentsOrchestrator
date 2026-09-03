import type { Gap, OutlineSpec, OutlineSpecSection } from "@ao/shared";
import type { AssembledFile } from "../parse/index.js";
import { assembleFiles, concatOrdered, type SectionResult } from "../reducers/local-reducers.js";
import type { TaskResult } from "../reducers/types.js";
import { attachOwnership, type SectionOwnership } from "../sharding/outline-shard.js";

/**
 * A targeted retry — carries everything a scheduler needs to re-dispatch
 * *just* the missing section, sourced from the original `OutlineSpec`
 * section (P8-T1's goal/expectedOutputTokens/deliverableKind/path), not a
 * re-run of the whole stage (ARCHITECTURE.md §6 point 3: "חסר -> משימה
 * חוזרת ממוקדת").
 */
export interface RetryTask {
  taskId: string;
  sectionId: string;
  title: string;
  goal: string;
  deliverableKind: "markdown" | "files";
  path?: string;
  expectedOutputTokens: number;
}

export interface AssembleOutcome {
  /** `local:concat-ordered`'s output over every `markdown` section, in outline order. Empty string if the outline has no markdown sections. */
  markdown: string;
  /** `local:assemble-files`'s output over every `files` section, re-ordered to match the outline (P8-T3's own "הרכבה לפי סדר השלד" for the files half — `assembleFiles` itself is order-agnostic, P5-T10). */
  files: AssembledFile[];
  /** Every gap from both underlying reducers (missing markdown sections, path collisions) plus this module's own files-completeness check — kept for transparency even though `retryTasks` already covers the actionable subset. */
  gaps: Gap[];
  retryTasks: RetryTask[];
}

export interface AssembleParams {
  stageId: string;
  outlineSpec: OutlineSpec;
  /** From `planSectionOwnership` (P8-T2) — which task owns each section, so a retry task can name the original owner it's re-dispatching. */
  ownership: readonly SectionOwnership[];
  markdownInputs: readonly TaskResult<SectionResult[]>[];
  fileInputs: readonly TaskResult<AssembledFile[]>[];
}

function ownerTaskIdFor(sectionId: string, ownership: readonly SectionOwnership[]): string {
  const owner = ownership.find((o) => o.sectionId === sectionId);
  // Every section is guaranteed an owner by P8-T2's planSectionOwnership — a
  // missing entry here means the caller passed an ownership list that
  // doesn't match outlineSpec, which is a caller bug worth a clear message
  // rather than an unexplained `undefined` flowing into a retry task id.
  if (!owner) throw new Error(`section "${sectionId}" has no entry in the supplied ownership list`);
  return owner.ownerTaskId;
}

function buildRetryTask(section: OutlineSpecSection, ownerTaskId: string): RetryTask {
  const base = {
    taskId: `${ownerTaskId}#retry`,
    sectionId: section.id,
    title: section.title,
    goal: section.goal,
    expectedOutputTokens: section.expectedOutputTokens,
  };
  return section.deliverableKind === "files"
    ? { ...base, deliverableKind: "files" as const, path: section.path }
    : { ...base, deliverableKind: "markdown" as const };
}

/**
 * P8-T3 — assembles a Stage's finished sections in outline order and
 * verifies completeness, per ARCHITECTURE.md §6 point 3. Reuses P5-T10's
 * `local:concat-ordered`/`local:assemble-files` reducers for the actual
 * merge (no reassembly logic duplicated here) but adds the one piece
 * neither reducer does on its own: a **files**-side completeness check —
 * `assembleFiles` (P5-T10) only ever reports a path *collision*, never a
 * path the outline named that no task produced at all, since it doesn't
 * even receive the outline. Missing-section detection for both halves is
 * therefore done here directly (outline section ids/paths vs. what was
 * actually produced) rather than parsed out of either reducer's `Gap.description`
 * text — a stable, structured check instead of a string-matching one.
 *
 * A missing section becomes a `RetryTask`, never a thrown error — "סעיף
 * חסר מייצר משימה חוזרת ממוקדת, לא כישלון של הכל" is this function's own
 * done-criterion, so it always returns a best-effort `AssembleOutcome`
 * even when every single section is missing.
 */
export function assembleOutline(params: AssembleParams): AssembleOutcome {
  const { stageId, outlineSpec, ownership, markdownInputs, fileInputs } = params;

  const markdownSections = outlineSpec.sections.filter((s) => s.deliverableKind === "markdown");
  const fileSections = outlineSpec.sections.filter((s) => s.deliverableKind === "files");

  const markdownSpec: OutlineSpec = { id: outlineSpec.id, sections: markdownSections };
  const markdownOwnership = ownership.filter((o) => markdownSections.some((s) => s.id === o.sectionId));
  // attachOwnership requires a non-empty section list — an outline with no
  // markdown sections never calls concatOrdered at all (empty string, no gaps).
  const markdownOutline =
    markdownSections.length > 0
      ? attachOwnership(markdownSpec, markdownOwnership)
      : { id: outlineSpec.id, sections: [] };
  const markdownResult =
    markdownSections.length > 0
      ? concatOrdered(markdownInputs, { stageId, outline: markdownOutline })
      : { value: "", gaps: [] as Gap[], needsLlmStitch: false };

  const filesResult = assembleFiles(fileInputs, { stageId });
  const producedPaths = new Set(filesResult.value.map((f) => f.path));
  const orderIndexByPath = new Map(fileSections.map((s, index) => [s.path, index]));
  const orderedFiles = [...filesResult.value].sort(
    (a, b) =>
      (orderIndexByPath.get(a.path) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndexByPath.get(b.path) ?? Number.MAX_SAFE_INTEGER),
  );

  const producedMarkdownIds = new Set(markdownInputs.flatMap((r) => r.value.map((s) => s.id)));
  const missingMarkdown = markdownSections.filter((s) => !producedMarkdownIds.has(s.id));
  const missingFiles = fileSections.filter((s) => !producedPaths.has(s.path));
  const missingSections = [...missingMarkdown, ...missingFiles];

  const missingGaps: Gap[] = missingSections.map((section) => ({
    description: `section "${section.id}" ("${section.title}") is missing from the assembled output`,
    reason: "no task produced this section — see the matching retry task",
    stageId,
  }));

  const retryTasks = missingSections.map((section) =>
    buildRetryTask(section, ownerTaskIdFor(section.id, ownership)),
  );

  // `markdownResult.gaps` (concatOrdered, P5-T10) only ever reports the
  // exact same "section is missing" cases `missingGaps` already covers
  // here (its one gap-producing branch) — folding both in would duplicate
  // every missing-section gap under two different phrasings. `filesResult.gaps`
  // is genuinely separate information (path collisions, not completeness),
  // so that one is kept.
  return {
    markdown: markdownResult.value,
    files: orderedFiles,
    gaps: [...filesResult.gaps, ...missingGaps],
    retryTasks,
  };
}
