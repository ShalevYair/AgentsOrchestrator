import * as React from "react";
import { useTranslation } from "react-i18next";
import { api, type EnvironmentReport } from "../../lib/api.js";
import { AlertCircle, Check } from "../ui/icons.js";

/**
 * P12-T2. Static labels below go through i18n (P2-T3's rule); the
 * `installInstructions`/`sandbox.notes` strings from the backend do not —
 * they're diagnostic text detected at runtime (which interpreter, which
 * kernel feature is missing), following the same choice already made for
 * `SandboxCapabilities.notes` (see `packages/tools/src/sandbox/capabilities.ts`).
 */
export function EnvironmentStatus(): React.JSX.Element | null {
  const { t } = useTranslation();
  const [report, setReport] = React.useState<EnvironmentReport | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api
      .environment()
      .then((result) => {
        if (!cancelled) setReport(result);
      })
      .catch(() => {
        // Best-effort status display only — never blocks the rest of Settings.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t("settings.environment.heading")}</h3>
      {!report ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("settings.environment.loading")}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex items-center gap-1.5">
            <Check className="text-emerald-600 dark:text-emerald-400" />
            {t("settings.environment.node", { version: report.node.version })}
          </li>
          <li className="flex items-start gap-1.5">
            {report.python.ok ? (
              <>
                <Check className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {t("settings.environment.pythonOk", { version: report.python.version })}
              </>
            ) : (
              <>
                <AlertCircle className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {t("settings.environment.pythonMissing")}
                  {report.python.installInstructions && (
                    <span className="block text-neutral-500 dark:text-neutral-400">
                      {report.python.installInstructions}
                    </span>
                  )}
                </span>
              </>
            )}
          </li>
          <li className="flex items-start gap-1.5">
            {report.docker.available ? (
              <>
                <Check className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {t("settings.environment.dockerAvailable")}
              </>
            ) : (
              <>
                <AlertCircle className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {t("settings.environment.dockerUnavailable")}
                  {report.sandbox.notes.map((note) => (
                    <span key={note} className="block text-neutral-500 dark:text-neutral-400">
                      {note}
                    </span>
                  ))}
                </span>
              </>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}
