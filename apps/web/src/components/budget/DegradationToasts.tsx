import * as React from "react";
import { useTranslation } from "react-i18next";
import { X } from "../ui/icons.js";
import { formatTokenCount } from "../../lib/cost.js";

export interface DegradationToast {
  id: string;
  amount: number;
  clamped: boolean;
}

export interface DegradationToastsProps {
  toasts: readonly DegradationToast[];
  onDismiss: (id: string) => void;
}

/**
 * BUDGET.md §8 / T6's own גמור line: "ההידרדרויות מופיעות כטוסטים
 * לא-חוסמים" — fixed-position stack, never intercepts clicks on the rest
 * of the page (no backdrop, no focus trap — unlike the Dialog-based
 * BudgetMeter/TaskDrawer, a toast that blocked interaction would be the
 * opposite of "non-blocking"). `aria-live="polite"` so a screen reader
 * announces it without interrupting whatever's being read.
 */
const AUTO_DISMISS_MS = 6000;

export function DegradationToasts({ toasts, onDismiss }: DegradationToastsProps): React.JSX.Element | null {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 start-4 z-40 flex flex-col gap-2"
      aria-live="polite"
      role="status"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({
  toast,
  onDismiss,
}: {
  toast: DegradationToast;
  onDismiss: (id: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const onDismissRef = React.useRef(onDismiss);
  onDismissRef.current = onDismiss;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      onDismissRef.current(toast.id);
    }, AUTO_DISMISS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [toast.id]);

  return (
    <div className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 shadow-lg dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span aria-hidden="true">⚠️</span>
      <p className="flex-1">
        {t(toast.clamped ? "budgetMeter.toast.degradedClamped" : "budgetMeter.toast.degraded", {
          amount: formatTokenCount(toast.amount),
        })}
      </p>
      <button
        type="button"
        onClick={() => {
          onDismiss(toast.id);
        }}
        aria-label={t("budgetMeter.toast.dismiss")}
        className="rounded p-0.5 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
      >
        <X />
      </button>
    </div>
  );
}
