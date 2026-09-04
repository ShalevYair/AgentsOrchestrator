import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button.js";

export interface OnboardingScreenProps {
  onOpenSettings: () => void;
  onContinue: () => void;
}

/**
 * UX.md §10's "אין מפתח API" row — a real designed screen, not the
 * previous behavior of silently force-opening Settings with no
 * explanation and no way to proceed without a key. Uses the
 * `onboarding.*` locale keys, which existed since P2-T7 but had no
 * component actually rendering them until now (verified — grepped the
 * whole tree; zero references outside the locale files themselves).
 */
export function OnboardingScreen({ onOpenSettings, onContinue }: OnboardingScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">{t("onboarding.title")}</p>
        <p className="max-w-sm text-sm text-neutral-500 dark:text-neutral-400">{t("onboarding.body")}</p>
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-neutral-700 underline hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
        >
          {t("settings.apiKey.getKeyLink")}
        </a>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onOpenSettings}>{t("onboarding.openSettings")}</Button>
        <Button variant="ghost" onClick={onContinue}>
          {t("onboarding.continueWithMock")}
        </Button>
      </div>
    </div>
  );
}
