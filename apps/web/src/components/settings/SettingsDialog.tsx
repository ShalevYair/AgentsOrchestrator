import * as React from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog.js";
import { ApiKeyForm } from "./ApiKeyForm.js";
import { EnvironmentStatus } from "./EnvironmentStatus.js";
import { LanguageSwitcher } from "./LanguageSwitcher.js";
import { TelemetryStatus } from "./TelemetryStatus.js";

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** P2-T7. */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("settings.close")}>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{t("settings.title")}</DialogTitle>
          <DialogDescription className="text-sm text-neutral-500 dark:text-neutral-400">
            {t("settings.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          <ApiKeyForm />
          <LanguageSwitcher />
          <EnvironmentStatus />
          <TelemetryStatus />
        </div>
      </DialogContent>
    </Dialog>
  );
}
