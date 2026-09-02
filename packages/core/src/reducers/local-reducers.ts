import type { Finding, Gap } from "@ao/shared";
import { findDuplicate, isDuplicateClaim, mergeFindings } from "../blackboard/dedupe.js";
import type { AssembledFile } from "../parse/index.js";
import type { ReduceContext, ReduceOutcome, Reducer, TaskResult } from "./types.js";

export interface SectionResult {
  id: string;
  title: string;
  body: string;
}

/**
 * `local:concat-ordered` (PROTOCOLS.md §8) — concatenates sections by the
 * Stage's outline order (ARCHITECTURE.md §6's skeleton-first strategy),
 * regardless of which Task produced which section or what order they
 * finished in. A section the outline names but no Task produced becomes a
 * `Gap` rather than aborting the whole assembly (principle #6: a partial
 * run still returns a deliverable). Without an outline, falls back to
 * first-seen order across `inputs` — still fully deterministic for a fixed
 * input array.
 */
export const concatOrdered: Reducer<SectionResult[], string> = (inputs, ctx) => {
  const sectionsById = new Map<string, SectionResult>();
  for (const result of inputs) {
    for (const section of result.value) {
      sectionsById.set(section.id, section);
    }
  }

  const order = ctx.outline ? ctx.outline.sections.map((s) => s.id) : [...sectionsById.keys()];
  const gaps: Gap[] = [];
  const parts: string[] = [];
  for (const sectionId of order) {
    const section = sectionsById.get(sectionId);
    if (!section) {
      gaps.push({
        description: `section "${sectionId}" is missing from the assembled output`,
        reason: "no task produced a section with this id",
        stageId: ctx.stageId,
      });
      continue;
    }
    parts.push(`## ${section.title}\n\n${section.body}`);
  }

  return { value: parts.join("\n\n"), gaps, needsLlmStitch: false };
};

/**
 * `local:dedupe-findings` (PROTOCOLS.md §8) — folds every Task's findings
 * through the same normalize -> lexical-similarity -> merge pipeline the
 * Blackboard uses on write (P5-T9's `dedupe.ts`), so a Stage's reduced
 * output and the Blackboard's live state can never disagree about what
 * counts as a duplicate.
 */
export const dedupeFindings: Reducer<Finding[], Finding[]> = (inputs) => {
  const merged: Finding[] = [];
  for (const result of inputs) {
    for (const finding of result.value) {
      const duplicate = findDuplicate(merged, finding);
      if (duplicate) {
        merged[merged.indexOf(duplicate)] = mergeFindings(duplicate, finding);
      } else {
        merged.push(finding);
      }
    }
  }
  return { value: merged, gaps: [], needsLlmStitch: false };
};

interface VoteGroup {
  representative: Finding;
  supportingTaskIds: Set<string>;
}

/**
 * `local:vote` (PROTOCOLS.md §8) — for `ensemble`/`debate` fan-out
 * (ARCHITECTURE.md §4): groups near-duplicate claims across members using
 * the same similarity check as dedup, then keeps only claims a strict
 * majority of the *distinct Tasks* supported. Everything short of majority
 * is reported as a disagreement `Gap` instead of silently dropped or
 * silently kept — this is deliberately a majority filter, not contradiction
 * detection (which would need semantic negation understanding a local,
 * network-free reducer can't do).
 */
export const vote: Reducer<Finding[], Finding[]> = (inputs, ctx) => {
  const groups: VoteGroup[] = [];
  for (const result of inputs) {
    for (const finding of result.value) {
      const group = groups.find((g) => isDuplicateClaim(g.representative.claim, finding.claim));
      if (group) {
        group.representative = mergeFindings(group.representative, finding);
        group.supportingTaskIds.add(result.taskId);
      } else {
        groups.push({ representative: finding, supportingTaskIds: new Set([result.taskId]) });
      }
    }
  }

  const totalVoters = new Set(inputs.map((r) => r.taskId)).size;
  const value: Finding[] = [];
  const gaps: Gap[] = [];
  for (const group of groups) {
    if (totalVoters > 0 && group.supportingTaskIds.size * 2 > totalVoters) {
      value.push(group.representative);
    } else {
      gaps.push({
        description: `claim "${group.representative.claim}" did not reach majority support (${String(group.supportingTaskIds.size)}/${String(totalVoters)} members)`,
        reason: "ensemble members disagreed",
        stageId: ctx.stageId,
      });
    }
  }
  return { value, gaps, needsLlmStitch: false };
};

/**
 * `local:assemble-files` (PROTOCOLS.md §8) — the pure, in-memory half only:
 * unions every Task's already sha256-verified files (P5-T7's parser) into
 * one flat list, reporting (not silently resolving) a path two Tasks both
 * claimed — exclusive file ownership is meant to already be enforced at
 * shard construction (P5-T5), so a collision reaching here is a
 * defense-in-depth signal, not the expected path. Actually staging the
 * files to disk and running the project's own toolchain as the validation
 * oracle (PROTOCOLS.md §4 / ARCHITECTURE.md §6 point 4) is disk I/O and
 * belongs to P8-T3/P8-T4/P8-T6 — `packages/core` stays I/O-free (README's
 * own constraint on this package), so this reducer never touches the
 * filesystem.
 */
export const assembleFiles: Reducer<AssembledFile[], AssembledFile[]> = (inputs, ctx) => {
  const seenPaths = new Map<string, string>();
  const gaps: Gap[] = [];
  const value: AssembledFile[] = [];
  for (const result of inputs) {
    for (const file of result.value) {
      const owner = seenPaths.get(file.path);
      if (owner !== undefined) {
        gaps.push({
          description: `path "${file.path}" was written by more than one task in stage "${ctx.stageId}" (tasks "${owner}" and "${result.taskId}")`,
          reason:
            "exclusive file ownership was violated — expected to already be prevented at shard construction (P5-T5)",
          stageId: ctx.stageId,
        });
        continue; // first writer wins; the conflict is reported, not silently overwritten
      }
      seenPaths.set(file.path, result.taskId);
      value.push(file);
    }
  }
  return { value, gaps, needsLlmStitch: false };
};

/** The fixed-shape `local:*` reducers, keyed by their `ReducerId` — `local:reduce-tree` needs a caller-supplied combiner (see `reduce-tree.ts`) so it can't live in a shape-fixed map like this one. */
export const LOCAL_REDUCERS = {
  "local:concat-ordered": concatOrdered,
  "local:dedupe-findings": dedupeFindings,
  "local:vote": vote,
  "local:assemble-files": assembleFiles,
};

export type { ReduceContext, ReduceOutcome, Reducer, TaskResult };
