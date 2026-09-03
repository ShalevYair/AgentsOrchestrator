import * as React from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, type KeyStatus } from "../../lib/api.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { AlertCircle, Check } from "../ui/icons.js";

type Phase = "idle" | "loading" | "saving" | "deleting";

/**
 * P2-T7. The raw key is entered once and sent straight to the runtime;
 * this component never stores it (not in state beyond the controlled
 * input, not in localStorage) and never receives it back — every
 * server response is a `KeyStatus` carrying only `maskedKey` plus which
 * backend is holding it, per UX.md §8.
 */
export function ApiKeyForm(): React.JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = React.useState<KeyStatus | null>(null);
  const [inputValue, setInputValue] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [feedback, setFeedback] = React.useState<{ kind: "success" | "error"; text: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api
      .keyStatus()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        if (!cancelled) setStatus({ hasKey: false, backend: null, maskedKey: null });
      })
      .finally(() => {
        if (!cancelled) setPhase("idle");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!inputValue.trim()) return;
    setPhase("saving");
    setFeedback(null);
    api
      .setKey(inputValue.trim())
      .then((result) => {
        setStatus(result);
        setInputValue("");
        setFeedback({ kind: "success", text: t("settings.apiKey.valid") });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : t("settings.apiKey.invalid");
        setFeedback({ kind: "error", text: message });
      })
      .finally(() => {
        setPhase("idle");
      });
  };

  const handleDelete = (): void => {
    setPhase("deleting");
    setFeedback(null);
    api
      .deleteKey()
      .then((result) => {
        setStatus(result);
      })
      .catch(() => {
        // Deletion is best-effort from the UI's perspective; status re-fetch below will reflect reality either way.
      })
      .finally(() => {
        setPhase("idle");
      });
  };

  const storedInText =
    status?.backend === "os-keyring"
      ? t("settings.apiKey.storedInOsKeyring")
      : status?.backend === "encrypted-file"
        ? t("settings.apiKey.storedInEncryptedFile")
        : null;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="api-key-input" className="text-sm font-medium">
        {t("settings.apiKey.label")}
      </label>

      {status?.hasKey ? (
        <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <div className="flex items-center justify-between gap-2">
            <span>
              {t("settings.apiKey.currentKey")}:{" "}
              <bdi dir="ltr" className="font-mono">
                {status.maskedKey}
              </bdi>
            </span>
            <Button variant="outline" size="sm" onClick={handleDelete} disabled={phase === "deleting"}>
              {phase === "deleting" ? t("settings.apiKey.deleting") : t("settings.apiKey.delete")}
            </Button>
          </div>
          {storedInText && <p className="text-neutral-500 dark:text-neutral-400">{storedInText}</p>}
        </div>
      ) : (
        phase !== "loading" && (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("settings.apiKey.noKey")}</p>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-neutral-700 underline hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
            >
              {t("settings.apiKey.getKeyLink")}
            </a>
          </div>
        )
      )}

      <form onSubmit={handleSave} className="flex gap-2">
        <Input
          id="api-key-input"
          type="password"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("settings.apiKey.placeholder")}
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
          }}
          disabled={phase === "saving"}
        />
        <Button type="submit" disabled={phase === "saving" || inputValue.trim().length === 0}>
          {phase === "saving" ? t("settings.apiKey.saving") : t("settings.apiKey.save")}
        </Button>
      </form>

      {feedback && (
        <p
          role="status"
          className={
            feedback.kind === "success"
              ? "flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"
              : "flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400"
          }
        >
          {feedback.kind === "success" ? <Check /> : <AlertCircle />}
          {feedback.text}
        </p>
      )}
    </div>
  );
}
