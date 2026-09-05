import * as React from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api.js";
import { AlertCircle, Check } from "../ui/icons.js";

/**
 * P12-T7. Read-only by design: `telemetryEnabled` is a `loadConfig()`-time
 * setting (config file / AO_TELEMETRY_ENABLED env — see docs/TELEMETRY.md),
 * not something any other setting in this app can currently live-toggle
 * without a restart, so this section is transparency (what's on right now,
 * and exactly what that means), not a control.
 */
export function TelemetryStatus(): React.JSX.Element | null {
  const { t } = useTranslation();
  const [enabled, setEnabled] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((result) => {
        if (!cancelled) setEnabled(result.telemetryEnabled);
      })
      .catch(() => {
        // Best-effort status display only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (enabled === null) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t("settings.telemetry.heading")}</h3>
      <p className="flex items-center gap-1.5 text-sm">
        {enabled ? (
          <Check className="text-emerald-600 dark:text-emerald-400" />
        ) : (
          <AlertCircle className="text-neutral-400 dark:text-neutral-500" />
        )}
        {enabled ? t("settings.telemetry.on") : t("settings.telemetry.off")}
      </p>
      <ul className="list-inside list-disc text-sm text-neutral-500 dark:text-neutral-400">
        <li>{t("settings.telemetry.collects1")}</li>
        <li>{t("settings.telemetry.collects2")}</li>
        <li>{t("settings.telemetry.collects3")}</li>
      </ul>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("settings.telemetry.howToChange")}</p>
    </div>
  );
}
