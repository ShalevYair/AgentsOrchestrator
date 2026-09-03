import * as React from "react";
import { useTranslation } from "react-i18next";
import { isRtl } from "./i18n/index.js";
import { api } from "./lib/api.js";
import type { BudgetMeterInfo } from "./lib/budget-projection.js";
import { Header } from "./components/layout/Header.js";
import { ChatView } from "./components/chat/ChatView.js";
import { SettingsDialog } from "./components/settings/SettingsDialog.js";
import { OnboardingScreen } from "./components/onboarding/OnboardingScreen.js";

/**
 * ADR-010: `dir`/`lang` on `<html>` react live to a language switch, not
 * just at initial load — driven off `i18n.language` here rather than a
 * one-time index.html attribute.
 */
function useDocumentLocale(): string {
  const { i18n } = useTranslation();
  React.useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = isRtl(i18n.language) ? "rtl" : "ltr";
  }, [i18n.language]);
  return i18n.language;
}

export default function App(): React.JSX.Element {
  useDocumentLocale();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [budgetInfo, setBudgetInfo] = React.useState<BudgetMeterInfo | null>(null);
  // UX.md §10 "אין מפתח API": null while we haven't heard back yet (we
  // optimistically render ChatView during that window, matching prior
  // behavior), then true/false once `api.keyStatus()` resolves.
  const [hasKey, setHasKey] = React.useState<boolean | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = React.useState(false);

  const refreshKeyStatus = React.useCallback((): void => {
    api
      .keyStatus()
      .then((status) => {
        setHasKey(status.hasKey);
      })
      .catch(() => {
        // Runtime unreachable at all is a bigger problem than this nicety —
        // fail open so an unreachable status check never blocks chat.
        setHasKey(true);
      });
  }, []);

  React.useEffect(() => {
    refreshKeyStatus();
  }, [refreshKeyStatus]);

  return (
    <div className="flex h-screen flex-col">
      <Header budgetInfo={budgetInfo} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex flex-1 overflow-hidden">
        {hasKey === false && !onboardingDismissed ? (
          <OnboardingScreen
            onOpenSettings={() => setSettingsOpen(true)}
            onContinue={() => setOnboardingDismissed(true)}
          />
        ) : (
          <ChatView onBudgetChange={setBudgetInfo} onOpenSettings={() => setSettingsOpen(true)} />
        )}
      </main>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) refreshKeyStatus();
        }}
      />
    </div>
  );
}
