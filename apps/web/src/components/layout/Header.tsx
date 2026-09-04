import * as React from "react";
import { useTranslation } from "react-i18next";
import type { BudgetMeterInfo } from "../../lib/budget-projection.js";
import { Button } from "../ui/button.js";
import { Settings } from "../ui/icons.js";
import { BudgetMeter } from "../budget/BudgetMeter.js";
import { ThemeToggle } from "./ThemeToggle.js";

export interface HeaderProps {
  /** `null` until `ChatView` has loaded a thread and computed its first budget snapshot — the chip is simply omitted until then rather than showing a fabricated 0/0. */
  budgetInfo: BudgetMeterInfo | null;
  onOpenSettings: () => void;
}

/** UX.md §1's layout sketch: brand · budget meter · settings · theme toggle. */
export function Header({ budgetInfo, onOpenSettings }: HeaderProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <header className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <h1 className="text-sm font-semibold">{t("app.title")}</h1>
      <div className="flex items-center gap-2">
        {budgetInfo && <BudgetMeter {...budgetInfo} />}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("header.settingsButton")}
          title={t("header.settingsButton")}
          onClick={onOpenSettings}
        >
          <Settings />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
