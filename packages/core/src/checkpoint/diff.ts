/**
 * P6-T4 — human-readable diffs. `PlanAmendedEventSchema` (PROTOCOLS.md §9)
 * already carries both `patch` (the raw ops, for machine replay) and
 * `diff: string` (for display) side by side, so this module's only job is
 * turning a JSON Patch — or, for a full replan, two whole `Plan` documents
 * — into that second, readable form.
 */

import type { JsonPatchOperation, Plan } from "@ao/shared";
import { resolvePointer } from "./json-pointer.js";

function formatValue(value: unknown): string {
  if (value === undefined) return "∅";
  return JSON.stringify(value);
}

/** One line per operation: `replace /path: old → new`, `add /path = value`, `remove /path (was: old)`, `move /from → /path`, `copy /from → /path`, `test /path == value`. `previousPlan` supplies "old" values for replace/remove where resolvable. */
export function formatPlanDiff(patch: readonly JsonPatchOperation[], previousPlan: Plan): string {
  if (patch.length === 0) return "(no changes)";
  const lines = patch.map((op) => {
    switch (op.op) {
      case "replace": {
        const before = resolvePointer(previousPlan, op.path);
        const oldText = before.found ? formatValue(before.value) : "∅";
        return `replace ${op.path}: ${oldText} → ${formatValue(op.value)}`;
      }
      case "add":
        return `add ${op.path} = ${formatValue(op.value)}`;
      case "remove": {
        const before = resolvePointer(previousPlan, op.path);
        return `remove ${op.path}${before.found ? ` (was: ${formatValue(before.value)})` : ""}`;
      }
      case "move":
        return `move ${op.from} → ${op.path}`;
      case "copy":
        return `copy ${op.from} → ${op.path}`;
      case "test":
        return `test ${op.path} == ${formatValue(op.value)}`;
      default: {
        const exhaustive: never = op;
        return String(exhaustive);
      }
    }
  });
  return lines.join("\n");
}

/**
 * A structural diff between two whole `Plan` documents — used by replan
 * (P6-T6), which produces a brand-new `Plan` rather than a JSON Patch, so
 * `formatPlanDiff` (which needs a patch) doesn't apply. Reports stage
 * additions/removals by id and, for a stage present in both, whether its
 * `agentType`/`fanout`/`tokenBudget.hardCap` changed — the same fields the
 * patch allowlist itself cares about, kept in sync deliberately rather
 * than diffing every field of every stage line-by-line.
 */
export function diffPlanStages(oldPlan: Plan, newPlan: Plan): string {
  const oldById = new Map(oldPlan.stages.map((s) => [s.id, s]));
  const newById = new Map(newPlan.stages.map((s) => [s.id, s]));
  const lines: string[] = [];

  for (const stage of newPlan.stages) {
    if (!oldById.has(stage.id)) lines.push(`+ stage "${stage.id}" (${stage.name})`);
  }
  for (const stage of oldPlan.stages) {
    if (!newById.has(stage.id)) lines.push(`- stage "${stage.id}" (${stage.name})`);
  }
  for (const stage of newPlan.stages) {
    const previous = oldById.get(stage.id);
    if (!previous) continue;
    if (previous.agentType !== stage.agentType) {
      lines.push(`~ stage "${stage.id}" agentType: ${previous.agentType} → ${stage.agentType}`);
    }
    if (
      previous.fanout.count !== stage.fanout.count ||
      previous.fanout.maxParallel !== stage.fanout.maxParallel ||
      previous.fanout.mode !== stage.fanout.mode
    ) {
      lines.push(
        `~ stage "${stage.id}" fanout: ${previous.fanout.mode}/${String(previous.fanout.count)}/${String(previous.fanout.maxParallel)} → ` +
          `${stage.fanout.mode}/${String(stage.fanout.count)}/${String(stage.fanout.maxParallel)}`,
      );
    }
    if (previous.tokenBudget.hardCap !== stage.tokenBudget.hardCap) {
      lines.push(
        `~ stage "${stage.id}" tokenBudget.hardCap: ${String(previous.tokenBudget.hardCap)} → ${String(stage.tokenBudget.hardCap)}`,
      );
    }
  }

  return lines.length > 0 ? lines.join("\n") : "(no stage-level changes)";
}
