/**
 * P6-T3 — safely applies an approved `CheckpointDecision.patch` to a live
 * `Plan`. `isPatchPathAllowed` (already implemented in `@ao/shared`'s
 * `checkpoint.ts`, P0/pre-P6) is only the *path-shape* gate — this module
 * is the value-level logic PROTOCOLS.md §6's allowlist table needs beyond
 * that shape check (its own doc comment names exactly this split), plus
 * actually applying and re-validating the result.
 *
 * The whole patch is accepted or rejected as one unit — PROTOCOLS.md §6:
 * "patch שנוגע במסלול אסור נדחה ... וה-Checkpoint מקבל continue" describes
 * a single decision transformation (amend → continue), not a per-operation
 * partial application. A rejected patch changes nothing: the returned
 * `plan` is `===` the input `plan` reference in that case.
 */

import { isPatchPathAllowed, PlanPatchRejectedError, type JsonPatchOperation, type Plan } from "@ao/shared";
import { applyJsonPatch, JsonPatchApplyError } from "./json-patch-apply.js";
import { resolvePointer } from "./json-pointer.js";
import { validatePlan, type PlanValidationContext } from "../plan/index.js";

export interface PlanPatchRejection {
  opIndex: number;
  op: JsonPatchOperation;
  reason: string;
}

export interface ApplyPlanPatchParams {
  plan: Plan;
  patch: readonly JsonPatchOperation[];
  /** Stage ids that already finished in this run (`computeResumePoint`, P5-T12) — a patch may never touch a completed stage, per PROTOCOLS.md §6's "הסרה/שינוי של שלב שכבר הסתיים" ❌ row. */
  completedStageIds: readonly string[];
  validationContext: PlanValidationContext;
}

export type ApplyPlanPatchResult =
  { status: "applied"; plan: Plan } | { status: "rejected"; plan: Plan; rejections: PlanPatchRejection[] };

const WHOLE_STAGE_PATH = /^\/stages\/(\d+)$/;
const HARD_CAP_PATH = /^\/stages\/(\d+)\/tokenBudget\/hardCap$/;
const ANY_STAGE_PATH = /^\/stages\/(\d+)(\/.*)?$/;

function stageIndexAndIdAt(plan: Plan, path: string): { index: number; id: string } | undefined {
  const match = ANY_STAGE_PATH.exec(path);
  if (!match) return undefined;
  const index = Number(match[1]);
  const stage = plan.stages[index];
  return stage ? { index, id: stage.id } : undefined;
}

/**
 * Value-level checks beyond path shape, for one operation. Returns a
 * rejection reason string, or `undefined` when the operation is fine.
 * `path` is checked; for `move`/`copy`, `from` is checked identically
 * (PROTOCOLS.md §6 never distinguishes source from destination — a patch
 * that reaches into a forbidden location to *read* is just as much a
 * bypass as one that writes there).
 */
function validateOpSemantics(
  op: JsonPatchOperation,
  plan: Plan,
  completedStageIds: ReadonlySet<string>,
): string | undefined {
  for (const path of [op.path, "from" in op ? op.from : undefined]) {
    if (path === undefined) continue;
    if (!isPatchPathAllowed(path)) return `path "${path}" is not on the checkpoint patch allowlist`;
  }

  const target = stageIndexAndIdAt(plan, op.path);
  if (target && completedStageIds.has(target.id)) {
    return `path "${op.path}" targets stage "${target.id}", which has already completed`;
  }

  const wholeStageMatch = WHOLE_STAGE_PATH.exec(op.path);
  if (wholeStageMatch) {
    if (op.op !== "add" && op.op !== "remove") {
      return `whole-stage path "${op.path}" only permits add/remove (got "${op.op}")`;
    }
    if (op.op === "remove") {
      const existing = plan.stages[Number(wholeStageMatch[1])];
      if (!existing?.optional) {
        return `"remove" at "${op.path}" targets a non-optional stage — only optional stages may be removed`;
      }
    }
    if (op.op === "add") {
      const value = op.value;
      const isOptional =
        value !== null &&
        typeof value === "object" &&
        (value as Record<string, unknown>)["optional"] === true;
      if (!isOptional) {
        return `"add" at "${op.path}" must add a stage with optional: true`;
      }
    }
  }

  const hardCapMatch = HARD_CAP_PATH.exec(op.path);
  if (hardCapMatch) {
    if (op.op !== "replace") {
      return `hardCap path "${op.path}" only permits "replace" (got "${op.op}")`;
    }
    const current = resolvePointer(plan, op.path);
    const proposed = op.value;
    if (typeof proposed !== "number" || !current.found || typeof current.value !== "number") {
      return `hardCap path "${op.path}" requires a numeric current and proposed value`;
    }
    if (proposed > current.value) {
      // PROTOCOLS.md §6: tokenBudget.hardCap may only move downward via a
      // checkpoint patch. "או מ-repairTokens" (or drawn from repairTokens)
      // describes a *Ledger*-level draw against the run's `repair` bucket
      // (BUDGET.md §3) when a stage is running low mid-flight — a
      // completely separate mechanism from this Plan document's own
      // static field, and out of a JSON Patch's reach here. A patch can
      // only ever lower this field, never raise it.
      return `hardCap path "${op.path}" may only move downward (${String(current.value)} → ${String(proposed)} is an increase)`;
    }
  }

  return undefined;
}

/**
 * P6-T3 — applies `params.patch` to `params.plan` if (and only if) every
 * operation passes both the path-shape allowlist and the value-level
 * checks above, the RFC 6902 apply itself succeeds, and the resulting
 * document re-validates cleanly through `validatePlan` (P5-T1). Any single
 * failure rejects the *entire* patch and returns the original `plan`
 * untouched — never a partially-applied document.
 */
export function applyPlanPatch(params: ApplyPlanPatchParams): ApplyPlanPatchResult {
  const { plan, patch, validationContext } = params;
  const completedStageIds = new Set(params.completedStageIds);

  if (patch.length === 0) {
    return { status: "applied", plan };
  }

  const rejections: PlanPatchRejection[] = [];
  patch.forEach((op, opIndex) => {
    const reason = validateOpSemantics(op, plan, completedStageIds);
    if (reason) rejections.push({ opIndex, op, reason });
  });
  if (rejections.length > 0) {
    return { status: "rejected", plan, rejections };
  }

  let patchedRaw: unknown;
  try {
    patchedRaw = applyJsonPatch(plan, patch);
  } catch (error) {
    const reason = error instanceof JsonPatchApplyError ? error.message : String(error);
    return {
      status: "rejected",
      plan,
      rejections: [{ opIndex: -1, op: patch[0]!, reason: `patch application failed: ${reason}` }],
    };
  }

  if (patchedRaw !== null && typeof patchedRaw === "object" && "version" in patchedRaw) {
    (patchedRaw as Record<string, unknown>)["version"] = plan.version + 1;
  }

  const validation = validatePlan(patchedRaw, validationContext);
  if (!validation.valid || !validation.plan) {
    const summary = validation.issues.map((issue) => `[${issue.code}] ${issue.message}`).join("; ");
    return {
      status: "rejected",
      plan,
      rejections: [
        { opIndex: -1, op: patch[0]!, reason: `patched plan failed re-validation: ${summary || "unknown"}` },
      ],
    };
  }

  return { status: "applied", plan: validation.plan };
}

/** Convenience for a caller that wants a hard failure instead of a soft "continue" fallback (e.g. an offline plan-editing tool, not the live checkpoint gate — see `gate.ts` for that path). */
export function applyPlanPatchOrThrow(params: ApplyPlanPatchParams): Plan {
  const result = applyPlanPatch(params);
  if (result.status === "rejected") {
    const summary = result.rejections.map((r) => `op[${String(r.opIndex)}]: ${r.reason}`).join("; ");
    throw new PlanPatchRejectedError(`plan patch rejected: ${summary}`, {
      details: { rejections: result.rejections },
    });
  }
  return result.plan;
}
