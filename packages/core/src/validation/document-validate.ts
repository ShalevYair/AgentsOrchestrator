import type { SectionResult } from "../reducers/local-reducers.js";

/**
 * P8-T4 — the document half of "אימות מקומי": headings, cross-references,
 * duplicate definitions, terminology consistency (ARCHITECTURE.md §6 point
 * 4). Pure and network-free — the project's own deterministic checks are
 * the oracle, not an LLM, so this costs zero tokens by construction (there
 * is no code path here that can reach a provider at all).
 *
 * Every violation carries `sectionIds` — the narrow locality of the
 * problem (one section for a self-contained issue, exactly two for an
 * issue that spans a pair) — because P8-T5's seam-stitch consumes this
 * directly as its candidate stitch scope. A validator that only said
 * "the document has a problem" would force P8-T5 to stitch the whole
 * thing; naming the specific section(s) is what keeps stitching bounded.
 */
export interface DocumentViolation {
  kind: "heading-level-skip" | "duplicate-heading" | "broken-cross-reference" | "inconsistent-terminology";
  sectionIds: string[];
  detail: string;
}

export interface DocumentValidationResult {
  passed: boolean;
  violations: DocumentViolation[];
}

const HEADING_LINE = /^(#{1,6})\s+(.+)$/;
/** Markdown links to a local anchor only (`[text](#slug)`) — cross-document/external links aren't this checker's concern. */
const LOCAL_LINK = /\[([^\]]*)\]\(#([^)]+)\)/g;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9֐-׿\s-]/g, "")
    .replace(/\s+/g, "-");
}

function checkHeadingLevelSkips(sections: readonly SectionResult[]): DocumentViolation[] {
  const violations: DocumentViolation[] = [];
  for (const section of sections) {
    const levels = section.body
      .split("\n")
      .map((line) => HEADING_LINE.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1]!.length);

    for (let i = 1; i < levels.length; i++) {
      const previous = levels[i - 1]!;
      const current = levels[i]!;
      if (current > previous + 1) {
        violations.push({
          kind: "heading-level-skip",
          sectionIds: [section.id],
          detail: `section "${section.id}" jumps from a level-${String(previous)} heading straight to level-${String(current)} (skipping level-${String(previous + 1)})`,
        });
      }
    }
  }
  return violations;
}

function checkDuplicateHeadings(sections: readonly SectionResult[]): DocumentViolation[] {
  const violations: DocumentViolation[] = [];
  const seenByTitle = new Map<string, string>(); // normalized title -> first section id
  for (const section of sections) {
    const normalized = section.title.trim().toLowerCase();
    const firstSeenIn = seenByTitle.get(normalized);
    if (firstSeenIn !== undefined) {
      violations.push({
        kind: "duplicate-heading",
        sectionIds: [firstSeenIn, section.id],
        detail: `sections "${firstSeenIn}" and "${section.id}" both use the title "${section.title}"`,
      });
    } else {
      seenByTitle.set(normalized, section.id);
    }
  }
  return violations;
}

function checkCrossReferences(sections: readonly SectionResult[]): DocumentViolation[] {
  const knownSlugs = new Set(sections.map((s) => slugify(s.title)));
  const violations: DocumentViolation[] = [];
  for (const section of sections) {
    for (const match of section.body.matchAll(LOCAL_LINK)) {
      const targetSlug = match[2]!;
      if (!knownSlugs.has(targetSlug)) {
        violations.push({
          kind: "broken-cross-reference",
          sectionIds: [section.id],
          detail: `section "${section.id}" links to "#${targetSlug}", which matches no section title in this outline`,
        });
      }
    }
  }
  return violations;
}

/** A word marks its normalized form as a "tracked term" worth watching for casing consistency if it carries its own internal capitalization signal — an all-caps acronym (`API`, `JSON`) or an internal-capital compound (`GitHub`, `TypeScript`). Plain sentence words are deliberately excluded from *triggering* tracking, to avoid flagging ordinary sentence-initial capitalization as a false positive — but see the two-pass approach below for why an *ordinary*-looking variant (`Github`) of an already-tracked term still gets caught. */
const TERM_LIKE_WORD = /\b(?:[A-Z][a-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z]{2,})\b/g;
const WORD = /\b[A-Za-z][A-Za-z0-9]*\b/g;

/**
 * Two-pass by design: pass 1 finds which normalized terms are worth
 * tracking at all (only ones with at least one "term-like" occurrence
 * somewhere — an all-caps acronym or an internal-capital compound); pass 2
 * then scans *every* plain word in the document for a case-insensitive
 * match against a tracked term, so a normal-looking variant like "Github"
 * (single leading capital, otherwise ordinary) is still caught once
 * "GitHub" has marked "github" as tracked — even though "Github" alone,
 * on its own, would never trigger tracking (it's indistinguishable from
 * plain sentence-initial capitalization in isolation).
 */
function checkTerminologyConsistency(sections: readonly SectionResult[]): DocumentViolation[] {
  const trackedTerms = new Set<string>();
  for (const section of sections) {
    const text = `${section.title}\n${section.body}`;
    for (const match of text.matchAll(TERM_LIKE_WORD)) trackedTerms.add(match[0].toLowerCase());
  }

  // normalized (lowercase) term -> exact surface form -> first section id it appeared in
  const variantsByTerm = new Map<string, Map<string, string>>();
  for (const section of sections) {
    const text = `${section.title}\n${section.body}`;
    for (const match of text.matchAll(WORD)) {
      const surface = match[0];
      const normalized = surface.toLowerCase();
      if (!trackedTerms.has(normalized)) continue;
      let variants = variantsByTerm.get(normalized);
      if (!variants) {
        variants = new Map();
        variantsByTerm.set(normalized, variants);
      }
      if (!variants.has(surface)) variants.set(surface, section.id);
    }
  }

  const violations: DocumentViolation[] = [];
  for (const [normalized, variants] of variantsByTerm) {
    if (variants.size < 2) continue;
    const entries = [...variants.entries()];
    const [firstSurface, firstSectionId] = entries[0]!;
    const [secondSurface, secondSectionId] = entries[1]!;
    violations.push({
      kind: "inconsistent-terminology",
      sectionIds: [firstSectionId, secondSectionId].filter((id, index, arr) => arr.indexOf(id) === index),
      detail:
        `the term "${normalized}" appears as both "${firstSurface}" (section "${firstSectionId}") and ` +
        `"${secondSurface}" (section "${secondSectionId}")${variants.size > 2 ? ` and ${String(variants.size - 2)} more variant(s)` : ""}`,
    });
  }
  return violations;
}

/**
 * Runs every check over the assembled document's sections (post-P8-T3
 * assembly — this validates the *finished* document, not individual
 * agent output). `passed` is `violations.length === 0`; a caller decides
 * separately whether any violation is severe enough to trigger P8-T5's
 * seam stitch, or just gets surfaced as a `Gap`.
 */
export function validateDocument(sections: readonly SectionResult[]): DocumentValidationResult {
  const violations = [
    ...checkHeadingLevelSkips(sections),
    ...checkDuplicateHeadings(sections),
    ...checkCrossReferences(sections),
    ...checkTerminologyConsistency(sections),
  ];
  return { passed: violations.length === 0, violations };
}
