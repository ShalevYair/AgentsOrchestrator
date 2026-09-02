/**
 * P6-T4 — plan version history. `packages/core` has no filesystem I/O of
 * its own (the same boundary `EventLog`'s `serialize()`/`fromSerialized()`
 * already draws, P5-T12) — `planVersionFileName`/`serializePlanVersion`
 * below are what a composition root (`apps/runtime`) writes to
 * `plan.vN.json`; this module itself only tracks the in-memory history and
 * produces the readable diff, never touching disk.
 */

import type { JsonPatchOperation, Plan } from "@ao/shared";
import { formatPlanDiff } from "./diff.js";

export interface PlanVersion {
  version: number;
  plan: Plan;
  /** Empty for version 1 (the initial plan, before any amendment). */
  patch: readonly JsonPatchOperation[];
  reason: string;
  diff: string;
}

export function planVersionFileName(version: number): string {
  return `plan.v${String(version)}.json`;
}

export function serializePlanVersion(planVersion: PlanVersion): string {
  return JSON.stringify(planVersion.plan, null, 2);
}

/**
 * Tracks every accepted amendment of one run's Plan, in order. Only
 * records what P6-T3's `applyPlanPatch` already accepted (`status:
 * "applied"`) — a rejected patch never reaches this class at all, so
 * there's no way to record a version for a change that didn't happen.
 */
export class PlanVersionHistory {
  private readonly history: PlanVersion[];

  constructor(initialPlan: Plan) {
    this.history = [
      {
        version: initialPlan.version,
        plan: initialPlan,
        patch: [],
        reason: "initial plan",
        diff: "(initial plan)",
      },
    ];
  }

  current(): Plan {
    return this.history[this.history.length - 1]!.plan;
  }

  versions(): readonly PlanVersion[] {
    return this.history;
  }

  /** Records an already-applied amendment. `newPlan` must be the result `applyPlanPatch` returned for `patch` against `this.current()` — this class doesn't re-apply or re-validate anything itself, only tracks and diffs. */
  recordAmendment(newPlan: Plan, patch: readonly JsonPatchOperation[], reason: string): PlanVersion {
    const diff = formatPlanDiff(patch, this.current());
    const entry: PlanVersion = { version: newPlan.version, plan: newPlan, patch, reason, diff };
    this.history.push(entry);
    return entry;
  }
}
