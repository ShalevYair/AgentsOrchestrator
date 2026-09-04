import * as React from "react";
import { useTranslation } from "react-i18next";
import type { GoalConfig } from "@ao/shared";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog.js";
import { estimateCostUsd, formatTokenCount, formatUsd } from "../../lib/cost.js";
import { GoalForm, LEVEL_ICON } from "./GoalForm.js";

export interface GoalButtonProps {
  value: GoalConfig;
  onChange: (next: GoalConfig) => void;
  /** Non-null when the last persistence attempt (P9-T1: "נשמר לשיחה") failed — shown inline, the form stays interactive either way. */
  saveError: string | null;
}

/**
 * UX.md §3's goal button: a tag on the message box ("⚖️ סטנדרט · 2.5M")
 * that opens the full settings panel. The tag itself is the live summary
 * required by "תגית על התיבה מציגה את המצב הנוכחי".
 */
export function GoalButton({ value, onChange, saveError }: GoalButtonProps): React.JSX.Element {
  const { t } = useTranslation();
  const cost = estimateCostUsd(value.budgetTotal);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t("goal.triggerLabel", {
            level: t(`goal.levels.${value.level}`),
            tokens: formatTokenCount(value.budgetTotal),
            cost: cost !== null ? formatUsd(cost) : "?",
          })}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-transparent px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <span aria-hidden="true">{LEVEL_ICON[value.level]}</span>
          <bdi>
            {t(`goal.levels.${value.level}`)} · {formatTokenCount(value.budgetTotal)}
          </bdi>
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={t("goal.close")} className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden="true">🎯</span> {t("goal.title")}
          </DialogTitle>
        </DialogHeader>
        <GoalForm value={value} onChange={onChange} />
        <div className="mt-4 flex items-center justify-between border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          <bdi>
            {formatTokenCount(value.budgetTotal)}
            {cost !== null && <> · ≈{formatUsd(cost)}</>}
          </bdi>
          {saveError && (
            <span role="alert" className="text-red-600 dark:text-red-400">
              {saveError}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
