import type { Stage } from "@ao/shared";

/**
 * A deterministic topological order of `stages` by `dependsOn` (Kahn's
 * algorithm). Assumes `stages` is already acyclic — P5-T1's V1 validation
 * is what actually proves that, before a Plan ever reaches the Scheduler,
 * so this function doesn't re-detect cycles itself. Among stages that are
 * simultaneously ready, ties break by stage id (ascending) so the order is
 * reproducible run to run, not just "some" valid topological order.
 */
export function topologicalStageOrder(stages: readonly Stage[]): string[] {
  const remainingInDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const stage of stages) remainingInDegree.set(stage.id, stage.dependsOn.length);
  for (const stage of stages) {
    for (const dep of stage.dependsOn) {
      const list = dependents.get(dep) ?? [];
      list.push(stage.id);
      dependents.set(dep, list);
    }
  }

  const queue = stages.filter((s) => s.dependsOn.length === 0).map((s) => s.id);
  const order: string[] = [];

  while (queue.length > 0) {
    queue.sort();
    const id = queue.shift()!;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = (remainingInDegree.get(dependent) ?? 0) - 1;
      remainingInDegree.set(dependent, remaining);
      if (remaining === 0) queue.push(dependent);
    }
  }

  return order;
}
