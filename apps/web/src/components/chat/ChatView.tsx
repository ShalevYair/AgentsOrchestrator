import * as React from "react";
import { useTranslation } from "react-i18next";
import type { GoalConfig, RuntimeEvent } from "@ao/shared";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import { api, ApiError, type ChatMessage } from "../../lib/api.js";
import { RunEventSocket, type WsStatus } from "../../lib/ws.js";
import { applyRuntimeEvent, INITIAL_RUN_STATE } from "../../lib/run-state.js";
import { projectFinalTokens, type BudgetMeterInfo } from "../../lib/budget-projection.js";
import { AlertCircle, ChevronDown } from "../ui/icons.js";
import { OrchestrationBoard } from "../board/OrchestrationBoard.js";
import { TaskDrawer } from "../board/TaskDrawer.js";
import { DegradationToasts, type DegradationToast } from "../budget/DegradationToasts.js";
import { EgressPanel } from "../egress/EgressPanel.js";
import { ChatInput } from "./ChatInput.js";
import { MessageList } from "./MessageList.js";

/**
 * Matches both the WS `error` event's payload (`ErrorEventSchema`, which
 * validates `scope`/`code` as plain strings rather than re-deriving
 * `ErrorScope`/`ErrorCode`'s literal unions) and `ApiError.serialized`
 * (`SerializedError` from `@ao/shared`, already the wider shape's source)
 * — one local type both real error sources fit without a cast.
 */
interface RunError {
  scope: string;
  code: string;
  message: string;
  recoverable: boolean;
}

export interface ChatViewProps {
  onBudgetChange: (info: BudgetMeterInfo) => void;
  /** UX.md §10 "מפתח לא תקין / פג": a provider-scoped runtime error offers a quick jump to Settings, not just an inert message. */
  onOpenSettings: () => void;
}

/**
 * P2-T4: the whole walking-skeleton chat path. Auto-creates/reuses a
 * single thread (no thread sidebar in P2 — "no orchestration" extends to
 * "no UI for features later phases own"), posts messages, and streams the
 * reply over the WS event bus chunk by chunk (P2-T6) into a live-updating
 * bubble until `run.finished`, at which point the authoritative persisted
 * messages (with real usage) are re-fetched from the runtime.
 */
export function ChatView({ onBudgetChange, onOpenSettings }: ChatViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = React.useState<string | null>(null);
  const [wsStatus, setWsStatus] = React.useState<WsStatus | null>(null);
  const [error, setError] = React.useState<RunError | null>(null);
  // UX.md §10 "ניתוק WebSocket": the reconnect + seq-based gap-fill itself
  // is already real (lib/ws.ts, apps/runtime/src/ws/hub.ts) — this is only
  // the transient "back online" confirmation once a `reconnecting` spell
  // resolves back to `open`, auto-dismissing like the degradation toasts.
  const previousWsStatusRef = React.useRef<WsStatus | null>(null);
  const [showConnectionRestored, setShowConnectionRestored] = React.useState(false);
  const [goalConfig, setGoalConfig] = React.useState<GoalConfig>(DEFAULT_GOAL_CONFIG);
  const [goalSaveError, setGoalSaveError] = React.useState<string | null>(null);
  const [runState, dispatchRunEvent] = React.useReducer(applyRuntimeEvent, INITIAL_RUN_STATE);
  // UX.md §1: "בלי ... ריצה פעילה — הלוח מוסתר לגמרי" (no board at all until
  // there's a plan) — `runState.plan` gates *presence*; this only gates the
  // manual "נפתח/נסגר" collapse of a board that's already showing.
  const [boardCollapsed, setBoardCollapsed] = React.useState(false);
  // UX.md §5 level 3 — which task's drawer (if any) is open. Lives here
  // (not inside OrchestrationBoard) because the drawer needs the owning
  // Stage from `runState.plan` too, not just the TaskState.
  const [openTaskId, setOpenTaskId] = React.useState<string | null>(null);
  const [toasts, setToasts] = React.useState<DegradationToast[]>([]);
  const socketRef = React.useRef<RunEventSocket | null>(null);
  // "Latest callback" ref so the budget-changed effect below doesn't need
  // `onBudgetChange` itself in its dependency array (a new function
  // identity from the parent every render would otherwise re-fire it).
  const onBudgetChangeRef = React.useRef(onBudgetChange);
  onBudgetChangeRef.current = onBudgetChange;

  React.useEffect(() => {
    let cancelled = false;
    api
      .listThreads()
      .then(async (threads) => {
        const thread = threads[0] ?? (await api.createThread());
        if (cancelled) return;
        setThreadId(thread.id);
        setGoalConfig(thread.goalConfig);
        const existing = await api.listMessages(thread.id);
        if (!cancelled) setMessages(existing);
      })
      .catch(() => {
        // A brand-new backend with an empty DB is the common case, not an error worth surfacing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => () => socketRef.current?.close(), []);

  React.useEffect(() => {
    const previous = previousWsStatusRef.current;
    previousWsStatusRef.current = wsStatus;
    if (previous === "reconnecting" && wsStatus === "open") {
      setShowConnectionRestored(true);
      const timer = setTimeout(() => {
        setShowConnectionRestored(false);
      }, 3000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [wsStatus]);

  const handleEvent = React.useCallback(
    (event: RuntimeEvent) => {
      dispatchRunEvent(event);
      switch (event.type) {
        case "task.delta": {
          const { envelope } = event.payload;
          if (envelope.t === "note") {
            const { text } = envelope;
            setStreamingText((prev) => (prev ?? "") + text);
          }
          break;
        }
        case "error": {
          setError(event.payload);
          break;
        }
        case "budget.degraded": {
          const { amount, clamped } = event.payload;
          setToasts((prev) => [...prev, { id: `deg-${String(event.seq)}`, amount, clamped }]);
          break;
        }
        case "run.finished": {
          socketRef.current?.close();
          socketRef.current = null;
          setStreamingText(null);
          if (threadId) {
            api
              .listMessages(threadId)
              .then((refreshed) => {
                setMessages(refreshed);
              })
              .catch(() => {
                // Best-effort refresh; the streamed text is still visible until this resolves.
              });
          }
          break;
        }
        default:
          break;
      }
    },
    [threadId],
  );

  /**
   * Optimistic update (the dialog reflects the new value immediately) with
   * rollback on failure — same pattern as every other write in this file.
   * `threadId` is guaranteed non-null here in practice (GoalButton only
   * renders once a thread exists), but the guard keeps this honest if that
   * ever changes.
   */
  const handleGoalConfigChange = (next: GoalConfig): void => {
    if (!threadId) return;
    const previous = goalConfig;
    setGoalConfig(next);
    setGoalSaveError(null);
    api.setGoalConfig(threadId, next).catch(() => {
      setGoalConfig(previous);
      setGoalSaveError(t("goal.saveFailed"));
    });
  };

  const handleSend = (text: string): void => {
    if (!threadId) return;
    setError(null);
    api
      .postMessage(threadId, text)
      .then(({ runId, userMessage }) => {
        setMessages((prev) => [...prev, userMessage]);
        setStreamingText("");
        socketRef.current?.close();
        socketRef.current = new RunEventSocket(runId, { onEvent: handleEvent, onStatusChange: setWsStatus });
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError && err.serialized
            ? err.serialized
            : {
                scope: "runtime",
                code: "INTERNAL",
                message: t("chat.turnFailed", { message: "" }),
                recoverable: false,
              },
        );
      });
  };

  const budgetInfo = React.useMemo<BudgetMeterInfo>(
    () => ({
      spent: runState.spent,
      committed: runState.committed,
      remaining: runState.remaining,
      total: goalConfig.budgetTotal,
      byStage: runState.byStage,
      projection: projectFinalTokens(runState.plan, runState.stages, runState.spent),
      overrunPolicy: goalConfig.overrunPolicy,
    }),
    [
      runState.spent,
      runState.committed,
      runState.remaining,
      runState.byStage,
      runState.plan,
      runState.stages,
      goalConfig.budgetTotal,
      goalConfig.overrunPolicy,
    ],
  );

  React.useEffect(() => {
    onBudgetChangeRef.current(budgetInfo);
  }, [budgetInfo]);

  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <div className="flex h-full flex-col">
      {wsStatus === "reconnecting" && (
        <div
          role="status"
          className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
        >
          {t("chat.connectionLost")}
        </div>
      )}
      {showConnectionRestored && (
        <div
          role="status"
          className="bg-emerald-100 px-4 py-1.5 text-center text-xs text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
        >
          {t("chat.connectionRestored")}
        </div>
      )}
      {error && (
        <div className="flex flex-col gap-1.5 bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle />
            <span>{error.message}</span>
          </div>
          {/* UX.md §10 "מפתח לא תקין / פג": any provider-scoped failure (a
              revoked/expired key surfaces here as PROVIDER_REQUEST_FAILED,
              not a distinct code — see run-chat.ts's toProviderError, which
              only special-cases 429) gets a real jump to Settings, not just
              inert text. */}
          {error.scope === "provider" && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="self-start text-xs font-medium underline hover:no-underline"
            >
              {t("chat.openSettingsFromError")}
            </button>
          )}
          {/* UX.md §10 "תקציב אזל": this chat path has no multi-stage run to
              summarize "what was done" from (admission is rejected before
              any provider call starts, run-chat.ts) — the one real, honest
              next step is pointing at the goal button that actually controls
              the budget, not a fabricated "continue" action nothing backs. */}
          {error.scope === "budget" && (
            <p className="text-xs text-red-600/80 dark:text-red-300/80">{t("chat.budgetErrorHint")}</p>
          )}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {(runState.plan ?? runState.egressCalls.length > 0) && (
          <aside
            className={`flex flex-none flex-col border-s border-neutral-200 dark:border-neutral-800 ${
              boardCollapsed ? "w-10" : "w-72"
            }`}
            data-testid="board-panel"
          >
            <div className="flex flex-none items-center justify-between gap-1 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
              {!boardCollapsed && (
                <h2 className="truncate text-sm font-medium">
                  {runState.plan ? t("board.title") : t("egress.title")}
                </h2>
              )}
              <button
                type="button"
                onClick={() => {
                  setBoardCollapsed((prev) => !prev);
                }}
                aria-expanded={!boardCollapsed}
                aria-label={boardCollapsed ? t("board.expand") : t("board.collapse")}
                className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <ChevronDown className={boardCollapsed ? "rotate-180" : undefined} />
              </button>
            </div>
            {!boardCollapsed && (
              <div className="flex flex-1 flex-col overflow-y-auto">
                {runState.plan && (
                  <OrchestrationBoard
                    plan={runState.plan}
                    stages={runState.stages}
                    tasks={runState.tasks}
                    tasksByStage={runState.tasksByStage}
                    onSelectTask={setOpenTaskId}
                  />
                )}
                {runState.egressCalls.length > 0 && (
                  <div
                    className={
                      runState.plan ? "border-t border-neutral-200 p-2 dark:border-neutral-800" : "p-2"
                    }
                  >
                    <EgressPanel
                      totalBytes={runState.egressTotalBytes}
                      totalRedactions={runState.egressTotalRedactions}
                      calls={runState.egressCalls}
                    />
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
        <MessageList
          messages={messages}
          streamingText={streamingText}
          runState={runState}
          budgetTotal={goalConfig.budgetTotal}
          budgetLevel={goalConfig.level}
        />
      </div>
      <ChatInput
        onSend={handleSend}
        disabled={!threadId || streamingText !== null}
        goalConfig={goalConfig}
        onGoalConfigChange={handleGoalConfigChange}
        goalSaveError={goalSaveError}
      />
      <TaskDrawer
        task={openTaskId ? (runState.tasks[openTaskId] ?? null) : null}
        stage={
          openTaskId
            ? (runState.plan?.stages.find((s) => s.id === runState.tasks[openTaskId]?.stageId) ?? null)
            : null
        }
        open={openTaskId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenTaskId(null);
        }}
      />
      <DegradationToasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
