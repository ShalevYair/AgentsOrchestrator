import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button.js";
import { Settings } from "../ui/icons.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { TokenCounter } from "./TokenCounter.js";

export interface HeaderProps {
  tokens: number;
  onOpenSettings: () => void;
}

/** UX.md §1's layout sketch: brand · token chip · settings · theme toggle. */
export function Header({ tokens, onOpenSettings }: HeaderProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <header className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <h1 className="text-sm font-semibold">{t("app.title")}</h1>
      <div className="flex items-center gap-2">
        <TokenCounter tokens={tokens} />
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
