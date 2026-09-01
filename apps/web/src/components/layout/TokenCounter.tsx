import * as React from "react";
import { useTranslation } from "react-i18next";

export interface TokenCounterProps {
  tokens: number;
}

/**
 * P2-T8: display-only running total for the current thread (definition:
 * see lib/usage.ts). No budget ceiling or progress bar yet — that's P4.
 */
export function TokenCounter({ tokens }: TokenCounterProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
      aria-live="polite"
    >
      <span aria-hidden="true">💰</span>
      <bdi>{t("header.tokensUsed", { count: tokens })}</bdi>
    </span>
  );
}
