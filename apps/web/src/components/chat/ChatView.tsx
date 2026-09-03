import * as React from "react";
import { useTranslation } from "react-i18next";
import type { GoalConfig, RuntimeEvent } from "@ao/shared";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import { api, type ChatMessage } from "../../lib/api.js";
import { RunEventSocket, type WsStatus } from "../../lib/ws.js";
import { sumThreadTokens } from "../../lib/usage.js";
import { applyRuntimeEvent, INITIAL_RUN_STATE } from "../../lib/run-state.js";
import { AlertCircle, ChevronDown } from "../ui/icons.js";
import { OrchestrationBoard } from "../board/OrchestrationBoard.js";
import { TaskDrawer } from "../board/TaskDrawer.js";
import { ChatInput } from "./ChatInput.js";
import { MessageList } from "./MessageList.js";

export interface ChatViewProps {
  onTokensChange: (tokens: number) => void;
}

/**
 * P2-T4: the whole walking-skeleton chat path. Auto-creates/reuses a
 * single thread (no thread sidebar in P2 — "no orchestration" extends to
 * "no UI for features later phases own"), posts messages, and streams the
 * reply over the WS event bus chunk by chunk (P2-T6) into a live-updating
 * bubble until `run.finished`, at which point the authoritative persisted
 * messages (with real usage) are re-fetched from the runtime.
 */
export function ChatView({ onTokensChange }: ChatViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = React.useState<string | null>(null);
  const [wsStatus, setWsStatus] = React.useState<WsStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
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
  const socketRef = React.useRef<RunEventSocket | null>(null);
  // "Latest callback" ref so the tokens-changed effect below doesn't need
  // `onTokensChange` itself in its dependency array (a new function
  // identity from the parent every render would otherwise re-fire it).
  const onTokensChangeRef = React.useRef(onTokensChange);
  onTokensChangeRef.current = onTokensChange;

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
          setError(event.payload.message);
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
      .catch(() => {
        setError(t("chat.turnFailed", { message: "" }));
      });
  };

  React.useEffect(() => {
    onTokensChangeRef.current?.(sumThreadTokens(messages));
  }, [messages]);

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
      {error && (
        <div className="flex items-center gap-2 bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle />
          <span>{error}</span>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {runState.plan && (
          <aside
            className={`flex flex-none flex-col border-s border-neutral-200 dark:border-neutral-800 ${
              boardCollapsed ? "w-10" : "w-72"
            }`}
            data-testid="board-panel"
          >
            <div className="flex flex-none items-center justify-between gap-1 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
              {!boardCollapsed && <h2 className="truncate text-sm font-medium">{t("board.title")}</h2>}
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
              <div className="flex-1 overflow-y-auto">
                <OrchestrationBoard
                  plan={runState.plan}
                  stages={runState.stages}
                  tasks={runState.tasks}
                  tasksByStage={runState.tasksByStage}
                  onSelectTask={setOpenTaskId}
                />
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
    </div>
  );
}
