import * as React from "react";
import { useTranslation } from "react-i18next";
import { setLocale, SUPPORTED_LOCALES, type Locale } from "../../i18n/index.js";
import { Button } from "../ui/button.js";

/** ADR-010: the language switcher lives in Settings and reacts live — no reload. */
export function LanguageSwitcher(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const current = i18n.language as Locale;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t("settings.language.label")}</span>
      <div className="flex gap-2">
        {SUPPORTED_LOCALES.map((locale) => (
          <Button
            key={locale}
            type="button"
            variant={current === locale ? "default" : "outline"}
            size="sm"
            aria-pressed={current === locale}
            onClick={() => {
              setLocale(locale);
            }}
          >
            {t(`settings.language.${locale}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
