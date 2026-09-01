import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils.js";
import { Markdown } from "./Markdown.js";

export interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export function MessageBubble({ role, content, streaming }: MessageBubbleProps): React.JSX.Element {
  const { t } = useTranslation();
  const isUser = role === "user";

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {isUser ? t("chat.you") : t("chat.assistant")}
      </span>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
          isUser
            ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
            : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : content.length > 0 ? (
          <Markdown content={content} />
        ) : null}
        {streaming && (
          <span
            className="ms-0.5 inline-block h-4 w-1.5 animate-pulse bg-current align-middle"
            aria-hidden="true"
          />
        )}
      </div>
      {streaming && (
        <span className="sr-only" role="status">
          {t("chat.thinking")}
        </span>
      )}
    </div>
  );
}
