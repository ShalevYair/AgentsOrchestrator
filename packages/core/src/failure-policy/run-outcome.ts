import type { Gap } from "@ao/shared";

export type RunStatus = "success" | "partial";

export interface RunOutcome<D> {
  status: RunStatus;
  /** Never `null`/`undefined` by contract — even the worst case (everything failed) still gets a caller-supplied placeholder value here, never nothing at all. */
  deliverable: D;
  gaps: Gap[];
}

/**
 * P5-T11 — ARCHITECTURE.md §10's global guarantee: "תמיד מוחזר תוצר. ריצה
 * חלקית מחזירה מה שיש + סעיף מפורש 'מה חסר ולמה'". This function is the
 * final, unconditional step of that guarantee: it cannot itself fail (no
 * branch throws, no branch returns `undefined`), so as long as every
 * upstream piece already guarantees the same — the `local:*` Reducers
 * always return a `value` alongside their `gaps` rather than throwing
 * (P5-T10), and `applyStageFailurePolicy`'s `"proceed"`/`"skip"`/
 * `"degrade"` branches always carry a `gaps` array (this file) — a Run
 * assembled through this chain can never end in nothing at all, only in a
 * `status: "partial"` result whose `gaps` explain exactly what's missing
 * and why.
 */
export function assembleRunOutcome<D>(deliverable: D, gaps: readonly Gap[]): RunOutcome<D> {
  return { status: gaps.length === 0 ? "success" : "partial", deliverable, gaps: [...gaps] };
}
