import * as React from "react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "../../lib/api.js";
import { MessageBubble } from "./MessageBubble.js";

export interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string | null;
}

export function MessageList({ messages, streamingText }: MessageListProps): React.JSX.Element {
  const { t } = useTranslation();
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streamingText]);

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
      {streamingText !== null && <MessageBubble role="assistant" content={streamingText} streaming />}
      <div ref={bottomRef} />
    </div>
  );
}
