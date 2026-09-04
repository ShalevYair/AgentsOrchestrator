import * as React from "react";
import { useTranslation } from "react-i18next";
import type { Plan } from "@ao/shared";
import { formatDuration, formatTokenCount } from "../../lib/cost.js";
import type { ProgressStatus, StageState, TaskState } from "../../lib/run-state.js";

export interface OrchestrationBoardProps {
  plan: Plan | null;
  stages: Record<string, StageState>;
  tasks: Record<string, TaskState>;
  tasksByStage: Record<string, string[]>;
  onSelectTask?: (taskId: string) => void;
}

const STATUS_ICON: Readonly<Record<ProgressStatus, string>> = {
  pending: "○",
  running: "⏳",
  done: "✅",
  issue: "⚠️",
  skipped: "⏭️",
};

interface Row {
  key: string;
  type: "stage" | "task";
  stageId: string;
  taskId?: string;
}

/**
 * UX.md §5's levels 1+2 in one accessible tree (`role="tree"`): stage rows
 * expand to reveal their task rows. Level 3 (the transparent box, P9-T5)
 * is a separate drawer opened via `onSelectTask` — this component only
 * ever renders the coarse start/finish-level data (never `task.delta`),
 * which is what keeps re-rendering cheap at "20 parallel agents" scale:
 * a stream of deltas updates one entry in `run-state.ts`'s `tasks` record
 * without touching any *other* entry's object reference, and every row
 * below is `React.memo`'d against exactly its own stage/task object, so a
 * delta racing in for task #7 never re-renders rows #1-6 or #8-20.
 */
export function OrchestrationBoard({
  plan,
  stages,
  tasks,
  tasksByStage,
  onSelectTask,
}: OrchestrationBoardProps): React.JSX.Element {
  const { t } = useTranslation();
  // Initial expansion (lazy — computed once, not on every render): the
  // running stage, or failing that (mounting straight into an
  // already-finished or reconnected run) the most recently active stage
  // in plan order — so a page reload doesn't default to "everything
  // collapsed, go click around to see what happened."
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => {
    const running = Object.values(stages).find((s) => s.status === "running");
    if (running) return new Set([running.stageId]);
    const active = (plan?.stages ?? []).map((s) => s.id).filter((id) => (tasksByStage[id]?.length ?? 0) > 0);
    const last = active[active.length - 1];
    return last ? new Set([last]) : new Set();
  });
  const [focusedKey, setFocusedKey] = React.useState<string | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLDivElement>());

  // Auto-expand a stage the moment it starts running, without fighting a
  // manual collapse the user already did for some *other* stage — only
  // ever adds, via the functional updater so this isn't a dependency of
  // its own effect.
  React.useEffect(() => {
    const runningIds = Object.values(stages)
      .filter((s) => s.status === "running")
      .map((s) => s.stageId);
    if (runningIds.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of runningIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [stages]);

  const doneCountByStage = React.useMemo(() => {
    const result: Record<string, number> = {};
    for (const [stageId, taskIds] of Object.entries(tasksByStage)) {
      result[stageId] = taskIds.filter((id) => {
        const status = tasks[id]?.status;
        return status === "done" || status === "issue";
      }).length;
    }
    return result;
  }, [tasks, tasksByStage]);

  const rows = React.useMemo<Row[]>(() => {
    if (!plan) return [];
    const flat: Row[] = [];
    for (const stage of plan.stages) {
      flat.push({ key: `stage:${stage.id}`, type: "stage", stageId: stage.id });
      if (expanded.has(stage.id)) {
        for (const taskId of tasksByStage[stage.id] ?? []) {
          flat.push({ key: `task:${taskId}`, type: "task", stageId: stage.id, taskId });
        }
      }
    }
    return flat;
  }, [plan, expanded, tasksByStage]);

  React.useEffect(() => {
    if (rows.length === 0) {
      setFocusedKey(null);
      return;
    }
    if (!rows.some((r) => r.key === focusedKey)) {
      setFocusedKey(rows[0]?.key ?? null);
    }
  }, [rows, focusedKey]);

  React.useEffect(() => {
    if (focusedKey) rowRefs.current.get(focusedKey)?.focus();
  }, [focusedKey]);

  function toggleExpanded(stageId: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  function moveFocus(delta: number): void {
    const index = rows.findIndex((r) => r.key === focusedKey);
    const nextIndex = Math.min(Math.max(index + delta, 0), rows.length - 1);
    const next = rows[nextIndex];
    if (next) setFocusedKey(next.key);
  }

  function handleRowKeyDown(event: React.KeyboardEvent, row: Row): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-1);
        break;
      case "Home":
        event.preventDefault();
        setFocusedKey(rows[0]?.key ?? null);
        break;
      case "End":
        event.preventDefault();
        setFocusedKey(rows[rows.length - 1]?.key ?? null);
        break;
      case "ArrowRight":
        event.preventDefault();
        if (row.type === "stage") {
          if (!expanded.has(row.stageId)) toggleExpanded(row.stageId);
          else moveFocus(1);
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (row.type === "stage" && expanded.has(row.stageId)) {
          toggleExpanded(row.stageId);
        } else if (row.type === "task") {
          setFocusedKey(`stage:${row.stageId}`);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (row.type === "stage") toggleExpanded(row.stageId);
        else if (row.taskId) onSelectTask?.(row.taskId);
        break;
      default:
        break;
    }
  }

  if (!plan) {
    return (
      <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400" data-testid="orchestration-board">
        {t("board.empty")}
      </div>
    );
  }

  return (
    <div
      role="tree"
      aria-label={t("board.title")}
      className="flex flex-col gap-1 overflow-y-auto p-2"
      data-testid="orchestration-board"
    >
      {plan.stages.map((stageSpec, index) => {
        const stageState = stages[stageSpec.id];
        const isExpanded = expanded.has(stageSpec.id);
        const rowKey = `stage:${stageSpec.id}`;
        return (
          <React.Fragment key={stageSpec.id}>
            <StageRow
              ref={(el) => {
                if (el) rowRefs.current.set(rowKey, el);
                else rowRefs.current.delete(rowKey);
              }}
              index={index}
              spec={stageSpec}
              state={stageState}
              doneCount={doneCountByStage[stageSpec.id] ?? 0}
              expanded={isExpanded}
              tabIndex={focusedKey === rowKey ? 0 : -1}
              onFocus={() => {
                setFocusedKey(rowKey);
              }}
              onClick={() => {
                toggleExpanded(stageSpec.id);
              }}
              onKeyDown={(e) => {
                handleRowKeyDown(e, { key: rowKey, type: "stage", stageId: stageSpec.id });
              }}
            />
            {isExpanded && (
              <div role="group" className="flex flex-col gap-0.5 ps-6">
                {(tasksByStage[stageSpec.id] ?? []).map((taskId) => {
                  const task = tasks[taskId];
                  if (!task) return null;
                  const taskRowKey = `task:${taskId}`;
                  return (
                    <TaskRow
                      key={taskId}
                      ref={(el) => {
                        if (el) rowRefs.current.set(taskRowKey, el);
                        else rowRefs.current.delete(taskRowKey);
                      }}
                      task={task}
                      tabIndex={focusedKey === taskRowKey ? 0 : -1}
                      onFocus={() => {
                        setFocusedKey(taskRowKey);
                      }}
                      onClick={() => {
                        onSelectTask?.(taskId);
                      }}
                      onKeyDown={(e) => {
                        handleRowKeyDown(e, { key: taskRowKey, type: "task", stageId: stageSpec.id, taskId });
                      }}
                    />
                  );
                })}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface StageRowProps {
  index: number;
  spec: Plan["stages"][number];
  state: StageState | undefined;
  /** Count of this stage's own tasks that have finished (done or issue) — computed by the parent from `tasks`/`tasksByStage` (StageRow itself never sees the full tasks map, so a delta on one task can't force every stage row to re-render). */
  doneCount: number;
  expanded: boolean;
  tabIndex: number;
  onFocus: () => void;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

const StageRow = React.memo(
  React.forwardRef<HTMLDivElement, StageRowProps>(function StageRow(
    { index, spec, state, doneCount, expanded, tabIndex, onFocus, onClick, onKeyDown },
    ref,
  ) {
    const { t } = useTranslation();
    const status: ProgressStatus = state?.status ?? "pending";
    const estimatedTokens = spec.tokenBudget.estimatedIn + spec.tokenBudget.estimatedOut;

    return (
      <div
        ref={ref}
        role="treeitem"
        aria-expanded={expanded}
        aria-level={1}
        aria-label={`${t(`board.status.${status}`)} ${spec.name}`}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800"
      >
        <span aria-hidden="true">{STATUS_ICON[status]}</span>
        <bdi>{index + 1}</bdi>
        <span className="flex-1">{spec.name}</span>
        <bdi className="text-xs text-neutral-500 dark:text-neutral-400">
          {status === "running"
            ? t("board.stageProgress", { done: doneCount, total: state?.taskCount ?? spec.fanout.count })
            : t("board.tokensActual", {
                actual: formatTokenCount(state?.tokensUsed ?? 0),
                estimate: formatTokenCount(estimatedTokens),
              })}
        </bdi>
      </div>
    );
  }),
);

interface TaskRowProps {
  task: TaskState;
  tabIndex: number;
  onFocus: () => void;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

const TaskRow = React.memo(
  React.forwardRef<HTMLDivElement, TaskRowProps>(function TaskRow(
    { task, tabIndex, onFocus, onClick, onKeyDown },
    ref,
  ) {
    const { t } = useTranslation();
    const outputTokens = task.usage?.candidatesTokens;
    const elapsedMs = (task.finishedAt ?? Date.now()) - task.startedAt;

    return (
      <div
        ref={ref}
        role="treeitem"
        aria-level={2}
        aria-label={`${t(`board.status.${task.status}`)} ${task.shard}`}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-xs hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800"
      >
        <span aria-hidden="true">{STATUS_ICON[task.status]}</span>
        <span aria-hidden="true">🤖</span>
        <bdi className="flex-1">{task.shard}</bdi>
        <bdi className="text-neutral-500 dark:text-neutral-400">
          {formatTokenCount(task.contextTokens)}
          {outputTokens !== undefined && <>→{formatTokenCount(outputTokens)}</>}
        </bdi>
        <bdi className="text-neutral-400 dark:text-neutral-500">{formatDuration(elapsedMs)}</bdi>
      </div>
    );
  }),
);
