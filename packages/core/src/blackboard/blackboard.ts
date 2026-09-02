import type {
  Blackboard as BlackboardState,
  BlackboardArtifactRef,
  Decision,
  Finding,
  Outline,
  OutlineSection,
  OpenQuestion,
} from "@ao/shared";
import { findDuplicate, mergeFindings } from "./dedupe.js";

export interface AddFindingResult {
  finding: Finding;
  /** True when `finding` was merged into an existing one rather than appended as new. */
  merged: boolean;
}

/** A finding formatted as one prompt-ready text block, tagged with the priority the docs assign to Blackboard content in ARCHITECTURE.md §5.3's fill order (tier 4 — "ממצאים קודמים"). Structurally compatible with `@ao/ingest`'s `ContextItem` without importing it — see the class doc comment for why. */
export interface FindingContextCandidate {
  id: string;
  priority: number;
  text: string;
}

const EMPTY_OUTLINE: Outline = { id: "outline", sections: [] };

/**
 * P5-T9 — the shared state PROTOCOLS.md §7 describes: `findings` (deduped
 * on write), `artifacts`, `decisions`, `openQuestions`, `outline`.
 *
 * "סוכן אף פעם לא מקבל את כולו — רק דרך ה-ContextBroker" is an access-
 * pattern rule, not something a plain state container can mechanically
 * enforce by itself — `packages/core` cannot depend on `@ao/ingest` (the
 * package that owns `selectContext`/`ContextBroker`) without inverting the
 * layering P1-T1/P4-T1 established (`core` depends only on `@ao/shared`).
 * The rule is upheld structurally instead: `snapshot()` is clearly named
 * and documented as being for persistence/event-sourcing (P5-T12) only,
 * while `findingsAsContextCandidates()` is the *only* other read path, and
 * it returns pre-formatted, per-item candidates in the exact duck-typed
 * shape `selectContext` consumes — a caller (the Scheduler/agent runner,
 * wired at the composition root) is meant to always go through the latter,
 * never hand `snapshot()`'s raw arrays straight into a prompt.
 */
export class Blackboard {
  private readonly findings: Finding[] = [];
  private readonly artifacts: BlackboardArtifactRef[] = [];
  private readonly decisions: Decision[] = [];
  private readonly openQuestions: OpenQuestion[] = [];
  private outline: Outline = EMPTY_OUTLINE;

  /** Adds `finding`, merging it into an existing near-duplicate (PROTOCOLS.md §7 / `dedupe.ts`) instead of appending a second copy when one is found. */
  addFinding(finding: Finding): AddFindingResult {
    const duplicate = findDuplicate(this.findings, finding);
    if (!duplicate) {
      this.findings.push(finding);
      return { finding, merged: false };
    }
    const index = this.findings.indexOf(duplicate);
    const merged = mergeFindings(duplicate, finding);
    this.findings[index] = merged;
    return { finding: merged, merged: true };
  }

  addArtifact(ref: BlackboardArtifactRef): void {
    const existingIndex = this.artifacts.findIndex((a) => a.id === ref.id);
    if (existingIndex >= 0) {
      this.artifacts[existingIndex] = ref;
    } else {
      this.artifacts.push(ref);
    }
  }

  addDecision(decision: Decision): void {
    this.decisions.push(decision);
  }

  addOpenQuestion(question: OpenQuestion): void {
    this.openQuestions.push(question);
  }

  /** Marks an open question resolved. Returns false (no-op) if `questionId` isn't found or is already resolved. */
  resolveOpenQuestion(questionId: string, resolvedBy: string): boolean {
    const question = this.openQuestions.find((q) => q.id === questionId);
    if (question?.resolvedBy !== null) return false;
    question.resolvedBy = resolvedBy;
    return true;
  }

  setOutline(outline: Outline): void {
    this.outline = outline;
  }

  /** Returns false (no-op) if `sectionId` isn't part of the current outline. */
  updateSectionStatus(sectionId: string, status: string): boolean {
    const section = this.outline.sections.find((s) => s.id === sectionId);
    if (!section) return false;
    section.status = status;
    return true;
  }

  getOutlineSections(): readonly OutlineSection[] {
    return this.outline.sections;
  }

  getOpenQuestions(): readonly OpenQuestion[] {
    return this.openQuestions;
  }

  /**
   * The Broker-facing read path for findings — one prompt-ready text block
   * per finding, at a single caller-supplied priority. `tagFilter`, when
   * given, keeps only findings carrying at least one of the listed tags
   * (ARCHITECTURE.md §5.3: "מסונן לרלוונטיות").
   */
  findingsAsContextCandidates(priority: number, tagFilter?: readonly string[]): FindingContextCandidate[] {
    const findings =
      tagFilter && tagFilter.length > 0
        ? this.findings.filter((f) => f.tags.some((t) => tagFilter.includes(t)))
        : this.findings;
    return findings.map((f) => ({
      id: f.id,
      priority,
      text: `[${f.confidence.toFixed(2)}] ${f.claim} (${f.evidence.map((e) => `${e.artifact}:${e.loc}`).join(", ")})`,
    }));
  }

  /** Full state snapshot — for event sourcing (P5-T12) and diagnostics only. Never hand this to an agent prompt directly; see the class doc comment. */
  snapshot(): BlackboardState {
    return {
      findings: this.findings.map((f) => ({ ...f, tags: [...f.tags], evidence: [...f.evidence] })),
      artifacts: [...this.artifacts],
      decisions: [...this.decisions],
      openQuestions: [...this.openQuestions],
      outline: { id: this.outline.id, sections: this.outline.sections.map((s) => ({ ...s })) },
    };
  }

  /** Rebuilds a Blackboard from a prior `snapshot()` — the resume half of P5-T12's event sourcing. */
  static fromSnapshot(state: BlackboardState): Blackboard {
    const board = new Blackboard();
    for (const finding of state.findings)
      board.findings.push({ ...finding, tags: [...finding.tags], evidence: [...finding.evidence] });
    for (const artifact of state.artifacts) board.artifacts.push({ ...artifact });
    for (const decision of state.decisions) board.decisions.push({ ...decision });
    for (const question of state.openQuestions) board.openQuestions.push({ ...question });
    board.outline = { id: state.outline.id, sections: state.outline.sections.map((s) => ({ ...s })) };
    return board;
  }
}
