import * as React from "react";
import { useTranslation } from "react-i18next";
import type { GoalConfig } from "@ao/shared";
import {
  buildAttachmentState,
  composeMessageWithAttachments,
  type AttachmentState,
} from "../../lib/attachments.js";
import { Button } from "../ui/button.js";
import { Paperclip, Send } from "../ui/icons.js";
import { GoalButton } from "../goal/GoalButton.js";
import { AttachmentCard } from "./AttachmentCard.js";

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
  const [attachments, setAttachments] = React.useState<AttachmentState[]>([]);
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${String(Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX))}px`;
  }, [value]);

  const isDisabled = disabled === true;

  const addFiles = (files: FileList | File[]): void => {
    void Promise.all(Array.from(files).map((file) => buildAttachmentState(file))).then((built) => {
      setAttachments((prev) => [...prev, ...built]);
    });
  };

  const removeAttachment = (id: string): void => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const submit = (): void => {
    const trimmed = value.trim();
    if (isDisabled || (!trimmed && attachments.length === 0)) return;
    const finalText = composeMessageWithAttachments(trimmed, attachments, (a) =>
      a.status === "ready" && a.content !== null
        ? t("chat.attachmentSection", { name: a.file.name, content: a.content })
        : t("chat.attachmentUnsupportedSection", { name: a.file.name }),
    );
    onSend(finalText);
    setValue("");
    setAttachments([]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={`flex flex-col gap-2 border-t p-3 ${
        isDraggingOver
          ? "border-neutral-400 bg-neutral-50 dark:border-neutral-500 dark:bg-neutral-900"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => {
        setIsDraggingOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDraggingOver(false);
        if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
      }}
    >
      {attachments.length > 0 && (
        <div className="flex flex-col gap-1">
          {attachments.map((attachment) => (
            <AttachmentCard key={attachment.id} attachment={attachment} onRemove={removeAttachment} />
          ))}
        </div>
      )}
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
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            aria-label={t("chat.attachFiles")}
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            disabled={isDisabled}
            aria-label={t("chat.attachFiles")}
            title={t("chat.attachFiles")}
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            <Paperclip />
          </Button>
          <GoalButton value={goalConfig} onChange={onGoalConfigChange} saveError={goalSaveError} />
        </div>
        <Button
          onClick={submit}
          disabled={isDisabled || (value.trim().length === 0 && attachments.length === 0)}
          aria-label={t("chat.send")}
        >
          {isDisabled ? t("chat.sending") : t("chat.send")}
          <Send />
        </Button>
      </div>
    </div>
  );
}
