import * as React from "react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "../../lib/api.js";
import type { RunState } from "../../lib/run-state.js";
import { PlanCard } from "../plan/PlanCard.js";
import { MessageBubble } from "./MessageBubble.js";

export interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string | null;
  /** P9-T2+: the current run's live state (plan, and later stage/task/ledger data), rendered inline in the stream — see run-state.ts. Optional so any other MessageList caller (tests, a future non-orchestration view) isn't forced to wire it. */
  runState?: RunState;
  budgetTotal?: number;
}

export function MessageList({
  messages,
  streamingText,
  runState,
  budgetTotal,
}: MessageListProps): React.JSX.Element {
  const { t } = useTranslation();
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const plan = runState?.plan;

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streamingText, plan]);

  if (messages.length === 0 && streamingText === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
        <p className="text-base font-medium">{t("chat.emptyTitle")}</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("chat.emptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} role={message.role} content={message.content} />
      ))}
      {plan && (
        <PlanCard
          plan={plan}
          estimatedTokens={runState?.estimatedTokens ?? 0}
          budgetTotal={budgetTotal ?? 0}
          amendment={runState?.amendment ?? null}
          requiresApproval={runState?.requiresApproval ?? false}
        />
      )}
      {streamingText !== null && <MessageBubble role="assistant" content={streamingText} streaming />}
      <div ref={bottomRef} />
    </div>
  );
}
