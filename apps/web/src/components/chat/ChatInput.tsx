import * as React from "react";
import { useTranslation } from "react-i18next";
import type { GoalConfig } from "@ao/shared";
import { Button } from "../ui/button.js";
import { Send } from "../ui/icons.js";
import { GoalButton } from "../goal/GoalButton.js";

export interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  goalConfig: GoalConfig;
  onGoalConfigChange: (next: GoalConfig) => void;
  goalSaveError?: string | null;
}

const MAX_TEXTAREA_HEIGHT_PX = 240;

/** UX.md §2: autogrowing textarea, Enter sends, Shift+Enter inserts a newline. */
export function ChatInput({
  onSend,
  disabled,
  goalConfig,
  onGoalConfigChange,
  goalSaveError = null,
}: ChatInputProps): React.JSX.Element {
  const { t } = useTranslation();
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${String(Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX))}px`;
  }, [value]);

  const isDisabled = disabled === true;

  const submit = (): void => {
    const trimmed = value.trim();
    if (!trimmed || isDisabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder={t("chat.placeholder")}
        rows={1}
        disabled={disabled}
        className="max-h-60 flex-1 resize-none rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:placeholder:text-neutral-500"
      />
      <div className="flex items-center justify-between gap-2">
        <GoalButton value={goalConfig} onChange={onGoalConfigChange} saveError={goalSaveError} />
        <Button
          onClick={submit}
          disabled={isDisabled || value.trim().length === 0}
          aria-label={t("chat.send")}
        >
          {isDisabled ? t("chat.sending") : t("chat.send")}
          <Send />
        </Button>
      </div>
    </div>
  );
}
