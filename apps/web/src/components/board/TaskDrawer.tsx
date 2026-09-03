import * as React from "react";
import { useTranslation } from "react-i18next";
import type { NdjsonEnvelope, Stage } from "@ao/shared";
import { Dialog, DrawerContent } from "../ui/dialog.js";
import { Button } from "../ui/button.js";
import { Copy, Download, RefreshCw } from "../ui/icons.js";
import { downloadBlob } from "../../lib/download.js";
import { formatDuration, formatTokenCount } from "../../lib/cost.js";
import type { TaskState } from "../../lib/run-state.js";

export interface TaskDrawerProps {
  task: TaskState | null;
  /** The task's owning `Stage` from the plan, if the plan is still loaded — carries the real `inputs`/`contextBudget`/`outputContract` shown in the "context" section. */
  stage: Stage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** No scheduler is wired to the UI yet (same documented gap as P9-T3's `onRun`) — the button calls this and a future caller decides what "rerun" means end to end. */
  onRerun?: (taskId: string) => void;
}

/**
 * UX.md §5 level 3 — "the tool for debugging the system and improving it."
 * Deliberately literal/structural rendering (labeled raw fields, not
 * prose) rather than a polished summary: the whole point is showing
 * exactly what came back, not a nicer retelling of it.
 */
export function TaskDrawer({
  task,
  stage,
  open,
  onOpenChange,
  onRerun,
}: TaskDrawerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  // Re-renders once a second while the task is still running so "usage.time" reads live instead of frozen at the moment the drawer opened.
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (task?.finishedAt !== null) return;
    const id = setInterval(forceTick, 1000);
    return () => {
      clearInterval(id);
    };
  }, [task]);

  if (!task) return null;

  const elapsedMs = (task.finishedAt ?? Date.now()) - task.startedAt;

  function handleExport(): void {
    if (!task) return;
    downloadBlob(`task-${task.taskId}.json`, JSON.stringify(task, null, 2), "application/json");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DrawerContent closeLabel={t("board.drawer.close")} aria-describedby={undefined}>
        <div className="flex flex-none items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <span aria-hidden="true">🤖</span>
          <div className="flex-1">
            <h2 className="text-sm font-semibold">
              <bdi>{task.shard}</bdi>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              <bdi>{task.agentType}</bdi> · {t(`board.status.${task.status}`)}
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
          <Section title={t("board.drawer.context")}>
            <Field label={t("board.drawer.contextTokens")} value={formatTokenCount(task.contextTokens)} />
            {stage && (
              <>
                <Field
                  label={t("board.drawer.contextBudget")}
                  value={formatTokenCount(stage.contextBudget.maxInputTokens)}
                />
                <Field
                  label={t("board.drawer.cacheContract")}
                  value={stage.contextBudget.cacheContract ? t("board.drawer.yes") : t("board.drawer.no")}
                />
                <Field
                  label={t("board.drawer.outputContract")}
                  value={`${stage.outputContract.schemaRef} · ${t("board.drawer.maxOutputTokens", {
                    tokens: formatTokenCount(stage.outputContract.maxOutputTokens),
                  })}`}
                />
                {stage.inputs.length > 0 && (
                  <div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {t("board.drawer.inputs")}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {stage.inputs.map((input, i) => (
                        <li key={i} className="text-xs">
                          <bdi>{input.from}</bdi> → <bdi>{input.select}</bdi>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Section>

          <Section title={t("board.drawer.output")}>
            {task.deltas.length === 0 ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("board.drawer.noOutputYet")}
              </p>
            ) : (
              <ol className="space-y-2">
                {task.deltas.map((envelope, i) => (
                  <li
                    key={i}
                    className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800"
                  >
                    <EnvelopeView envelope={envelope} />
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title={t("board.drawer.usage")}>
            <Field label={t("board.drawer.time")} value={formatDuration(elapsedMs)} />
            {task.usage && (
              <>
                <Field
                  label={t("board.drawer.promptTokens")}
                  value={formatTokenCount(task.usage.promptTokens)}
                />
                <Field
                  label={t("board.drawer.candidatesTokens")}
                  value={formatTokenCount(task.usage.candidatesTokens)}
                />
                <Field
                  label={t("board.drawer.thoughtsTokens")}
                  value={formatTokenCount(task.usage.thoughtsTokens)}
                />
                <Field
                  label={t("board.drawer.cacheHits")}
                  value={formatTokenCount(task.usage.cachedTokens)}
                />
              </>
            )}
            {task.finishReason !== null && (
              <Field label={t("board.drawer.finishReason")} value={task.finishReason} />
            )}
            {task.violations !== null && (
              <Field label={t("board.drawer.violations")} value={String(task.violations)} />
            )}
          </Section>
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
          <Button
            variant="outline"
            size="sm"
            disabled
            title={t("board.drawer.copyPromptUnavailable")}
            aria-label={t("board.drawer.copyPrompt")}
          >
            <Copy />
            {t("board.drawer.copyPrompt")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRerun?.(task.taskId)}
            disabled={!onRerun}
            aria-label={t("board.drawer.rerun")}
          >
            <RefreshCw />
            {t("board.drawer.rerun")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            aria-label={t("board.drawer.exportJson")}
          >
            <Download />
            {t("board.drawer.exportJson")}
          </Button>
        </div>
      </DrawerContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <bdi className="font-medium">{value}</bdi>
    </div>
  );
}

function EnvelopeView({ envelope }: { envelope: NdjsonEnvelope }): React.JSX.Element {
  const { t } = useTranslation();
  switch (envelope.t) {
    case "note":
      return <p className="whitespace-pre-wrap">{envelope.text}</p>;
    case "finding":
      return (
        <div>
          <p className="font-medium">{envelope.claim}</p>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            <bdi>{envelope.tags.join(", ")}</bdi> ·{" "}
            {t("board.drawer.envelope.evidence", { count: envelope.evidence.length })} ·{" "}
            <bdi>{(envelope.confidence * 100).toFixed(0)}%</bdi>
          </p>
        </div>
      );
    case "need":
      return (
        <div>
          <p className="font-medium">{envelope.what}</p>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">{envelope.query}</p>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">{envelope.why}</p>
        </div>
      );
    case "section":
      return (
        <div>
          <p className="font-medium">{envelope.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-neutral-500 dark:text-neutral-400">{envelope.body}</p>
        </div>
      );
    case "file_begin":
      return (
        <p>
          📄 <bdi>{envelope.path}</bdi> (<bdi>{envelope.op}</bdi>, <bdi>{envelope.encoding}</bdi>)
        </p>
      );
    case "file_chunk":
      return (
        <p className="text-neutral-500 dark:text-neutral-400">
          <bdi>{t("board.drawer.envelope.chunk", { seq: envelope.seq, count: envelope.data.length })}</bdi>
        </p>
      );
    case "file_end":
      return (
        <p className="text-neutral-500 dark:text-neutral-400">
          ✓{" "}
          <bdi>
            {t("board.drawer.envelope.fileEnd", {
              count: envelope.lines,
              hash: envelope.sha256.slice(0, 12),
            })}
          </bdi>
        </p>
      );
    case "tool_result":
      return (
        <p>
          🔧 <bdi>{envelope.toolId}</bdi> —{" "}
          <bdi>{envelope.ok ? t("board.drawer.envelope.ok") : t("board.drawer.envelope.failed")}</bdi>
          {envelope.truncated && <bdi> {t("board.drawer.envelope.truncated")}</bdi>}
        </p>
      );
    case "done":
      return (
        <div>
          <p className="font-medium">{envelope.summary}</p>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            <bdi>
              {t("board.drawer.envelope.criteria", {
                met: envelope.selfCheck.criteriaMet.length,
                total: envelope.selfCheck.criteriaMet.length + envelope.selfCheck.unmet.length,
              })}
            </bdi>{" "}
            · <bdi>{(envelope.selfCheck.confidence * 100).toFixed(0)}%</bdi>
          </p>
        </div>
      );
    default:
      return <p>{JSON.stringify(envelope)}</p>;
  }
}
