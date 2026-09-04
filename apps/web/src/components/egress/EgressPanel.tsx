import * as React from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog.js";
import { formatBytes } from "../../lib/artifact-kind.js";
import type { EgressCallRecord } from "../../lib/run-state.js";

export interface EgressPanelProps {
  totalBytes: number;
  totalRedactions: number;
  calls: readonly EgressCallRecord[];
}

/**
 * UX.md §7 — "מה יצא מהמחשב" (what left the machine). Real numbers only:
 * `totalBytes`/`totalRedactions`/`calls` come straight from `egress.recorded`
 * (fired for real in `run-chat.ts` off `GeminiProvider.getEgressRedactions()`
 * and the actual outbound payload size — see run-state.ts). Deliberately
 * does **not** render the mockup's "🚫 לא נשלח: N קבצים" line or a per-file
 * read-rung breakdown: both need a connected-folder/ingestion feature
 * (P3's `connectFolder`/`ingestFiles`) that isn't wired into `apps/web`
 * yet — no corpus to compare against, so nothing to honestly show there.
 */
export function EgressPanel({ totalBytes, totalRedactions, calls }: EgressPanelProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={
            totalRedactions > 0
              ? `${t("egress.triggerLabel", { bytes: formatBytes(totalBytes), count: calls.length })} — ${t("egress.redactionCount", { count: totalRedactions })}`
              : t("egress.triggerLabel", { bytes: formatBytes(totalBytes), count: calls.length })
          }
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <span aria-hidden="true">🔒</span>
          <bdi className="flex-1 text-start">{t("egress.sent", { bytes: formatBytes(totalBytes) })}</bdi>
          {totalRedactions > 0 && (
            <span
              className="rounded-full bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              aria-hidden="true"
            >
              🔴 {totalRedactions}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={t("goal.close")} className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden="true">🔒</span> {t("egress.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t("egress.summary", { bytes: formatBytes(totalBytes), count: calls.length })}
        </p>
        {totalRedactions > 0 && (
          <p
            role="status"
            className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            🔴 {t("egress.redactionCount", { count: totalRedactions })}
          </p>
        )}
        {calls.length > 0 && (
          <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {t("egress.calls")}
            </div>
            <ul className="space-y-1 text-sm">
              {calls.map((call) => (
                <li key={call.callId} className="flex items-center justify-between gap-2">
                  <bdi className="truncate text-neutral-500 dark:text-neutral-400">{call.callId}</bdi>
                  <bdi className="font-medium">
                    {formatBytes(call.bytes)}
                    {call.redactions > 0 && <> · 🔴 {call.redactions}</>}
                  </bdi>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
