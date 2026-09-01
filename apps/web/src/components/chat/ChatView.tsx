import * as React from "react";
import { useTranslation } from "react-i18next";
import type { RuntimeEvent } from "@ao/shared";
import { api, type ChatMessage } from "../../lib/api.js";
import { RunEventSocket, type WsStatus } from "../../lib/ws.js";
import { sumThreadTokens } from "../../lib/usage.js";
import { AlertCircle } from "../ui/icons.js";
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
      <MessageList messages={messages} streamingText={streamingText} />
      <ChatInput onSend={handleSend} disabled={!threadId || streamingText !== null} />
    </div>
  );
}
