import type { Plan, Stage } from "@ao/shared";

/** Sum of every stage's estimated tokens — the plan card's live "צפי" figure, recomputed after each local edit (no server round-trip exists to ask for a fresh one). */
export function sumPlanEstimatedTokens(plan: Plan): number {
  return plan.stages.reduce(
    (sum, stage) => sum + stage.tokenBudget.estimatedIn + stage.tokenBudget.estimatedOut,
    0,
  );
}

export function sumPlanAgents(plan: Plan): number {
  return plan.stages.reduce((sum, stage) => sum + stage.fanout.count, 0);
}

/**
 * Rescales a stage to a new `fanout.count` — `estimatedIn`/`estimatedOut`/
 * `hardCap` all scale proportionally (the M2 demo numbers imply
 * `tokenBudget` is the stage's *aggregate* across its whole fanout: the
 * reader stage's 30K-per-agent `contextBudget.maxInputTokens` × 6 agents
 * ≈ its 180K `estimatedIn`). This is a client-side approximation for live
 * UI feedback ("הצפי מתעדכן מיידית") — a real re-estimate would come from
 * the planner, which this session doesn't wire in. `maxParallel` is
 * clamped down with `count` (never left exceeding it — V6 would reject
 * that) but never raised back up automatically if the user had already
 * lowered it below the old count.
 */
export function scaleStageCount(stage: Stage, newCount: number): Stage {
  if (newCount === stage.fanout.count) return stage;
  const ratio = newCount / stage.fanout.count;
  return {
    ...stage,
    fanout: { ...stage.fanout, count: newCount, maxParallel: Math.min(stage.fanout.maxParallel, newCount) },
    tokenBudget: {
      ...stage.tokenBudget,
      estimatedIn: Math.round(stage.tokenBudget.estimatedIn * ratio),
      estimatedOut: Math.round(stage.tokenBudget.estimatedOut * ratio),
      hardCap: Math.round(stage.tokenBudget.hardCap * ratio),
    },
  };
}

export function setStageMaxParallel(stage: Stage, maxParallel: number): Stage {
  return { ...stage, fanout: { ...stage.fanout, maxParallel } };
}

export function replaceStage(plan: Plan, stageId: string, next: Stage): Plan {
  return { ...plan, stages: plan.stages.map((s) => (s.id === stageId ? next : s)) };
}

/**
 * UX.md §4: "הסרת שלבים אופציונליים" — only a stage with `optional: true`
 * can be removed at all. Also strips the removed id from every remaining
 * stage's `dependsOn` (a stage that only *ordered after* the removed one
 * shouldn't be left pointing at a dead reference) — but deliberately does
 * NOT try to guess whether some other stage's `inputs` actually consumed
 * the removed stage's output; if it did, `validatePlan`'s V5 catches that
 * for real (an input pointing at a stage that no longer exists), which is
 * the same validator this whole edit flow is built to never disagree
 * with, rather than a second, parallel guess at the same rule here.
 */
export function removeOptionalStage(plan: Plan, stageId: string): Plan {
  const target = plan.stages.find((s) => s.id === stageId);
  if (!target?.optional) return plan;
  return {
    ...plan,
    stages: plan.stages
      .filter((s) => s.id !== stageId)
      .map((s) =>
        s.dependsOn.includes(stageId) ? { ...s, dependsOn: s.dependsOn.filter((id) => id !== stageId) } : s,
      ),
  };
}

export function setMaxRung(plan: Plan, maxRung: Plan["readPolicy"]["maxRung"]): Plan {
  return { ...plan, readPolicy: { ...plan.readPolicy, maxRung } };
}
