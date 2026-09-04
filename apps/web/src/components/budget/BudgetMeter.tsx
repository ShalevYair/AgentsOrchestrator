import * as React from "react";
import { useTranslation } from "react-i18next";
import type { OverrunPolicy } from "@ao/shared";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog.js";
import { formatTokenCount } from "../../lib/cost.js";
import { budgetSeverity, type BudgetSeverity } from "../../lib/budget-projection.js";

export interface BudgetMeterProps {
  spent: number;
  committed: number;
  remaining: number;
  total: number;
  byStage: Record<string, number>;
  /** `null` when there's no real signal to project from yet — see `projectFinalTokens`. Never a fabricated number. */
  projection: number | null;
  overrunPolicy: OverrunPolicy;
}

const CHIP_SEVERITY_CLASSES: Record<BudgetSeverity, string> = {
  ok: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  danger: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

const BAR_SEVERITY_CLASSES: Record<BudgetSeverity, string> = {
  ok: "bg-neutral-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

/**
 * UX.md §1's header meter ("💰 1.2M/2.5M ▓▓▓▓▓░░░") + BUDGET.md §8's full
 * detail (burned/allocated/remaining, per-stage, rate-based projection,
 * color thresholds at 75%/90%). Graduates `TokenCounter` (P2-T8's
 * lifetime-count placeholder, deleted here) now that a real per-run budget
 * (P9-T1) and live `Ledger` accounting (`ledger.updated`) both exist.
 */
export function BudgetMeter({
  spent,
  committed,
  remaining,
  total,
  byStage,
  projection,
  overrunPolicy,
}: BudgetMeterProps): React.JSX.Element {
  const { t } = useTranslation();
  const severity = budgetSeverity(spent, committed, total);
  const ratio = total > 0 ? Math.min(1, (spent + committed) / total) : 0;
  const stageEntries = Object.entries(byStage);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t("budgetMeter.triggerLabel", {
            spent: formatTokenCount(spent),
            total: formatTokenCount(total),
          })}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${CHIP_SEVERITY_CLASSES[severity]}`}
        >
          <span aria-hidden="true">💰</span>
          <bdi>
            {formatTokenCount(spent)}/{formatTokenCount(total)}
          </bdi>
          <span
            aria-hidden="true"
            className="h-1.5 w-14 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
          >
            <span
              className={`block h-full ${BAR_SEVERITY_CLASSES[severity]}`}
              style={{ width: `${String(ratio * 100)}%` }}
            />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={t("goal.close")} className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden="true">💰</span> {t("goal.budgetSection")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 text-sm">
          <Row label={t("budgetMeter.spent")} value={formatTokenCount(spent)} />
          <Row label={t("budgetMeter.committed")} value={formatTokenCount(committed)} />
          <Row label={t("budgetMeter.remaining")} value={formatTokenCount(remaining)} />
          <Row
            label={t("budgetMeter.projection")}
            value={projection !== null ? formatTokenCount(projection) : t("budgetMeter.noProjection")}
          />
        </div>
        {stageEntries.length > 0 && (
          <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {t("budgetMeter.byStage")}
            </div>
            <div className="space-y-1">
              {stageEntries.map(([stageId, tokens]) => (
                <Row key={stageId} label={<bdi>{stageId}</bdi>} value={formatTokenCount(tokens)} />
              ))}
            </div>
          </div>
        )}
        {severity !== "ok" && (
          <p
            role="status"
            className={`mt-3 rounded-md p-2 text-xs ${
              severity === "danger"
                ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
            }`}
          >
            {t(severity === "danger" ? "budgetMeter.dangerNote" : "budgetMeter.warningNote")}{" "}
            {t("goal.overrunSection")}: {t(`goal.overrun.${overrunPolicy}`)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <bdi className="font-medium">{value}</bdi>
    </div>
  );
}
