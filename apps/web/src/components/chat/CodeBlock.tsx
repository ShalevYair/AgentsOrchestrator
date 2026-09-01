import * as React from "react";
import { useTranslation } from "react-i18next";
import { codeToHtml, type BundledLanguage } from "shiki";
import { Button } from "../ui/button.js";
import { Check, Copy } from "../ui/icons.js";

export interface CodeBlockProps {
  code: string;
  lang: string;
  /** Non-optional (vs. `filename?:`) so callers can pass through a `string | undefined` regex-match result directly under `exactOptionalPropertyTypes`. */
  filename: string | undefined;
}

const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const;
const COPY_RESET_MS = 1500;

/** P2-T5: Shiki syntax highlighting + a copy button + filename display when the fence specifies one. Always an LTR container (UX.md §9) regardless of surrounding paragraph direction. */
export function CodeBlock({ code, lang, filename }: CodeBlockProps): React.JSX.Element {
  const { t } = useTranslation();
  const [html, setHtml] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const options = { themes: SHIKI_THEMES, defaultColor: false } as const;
    codeToHtml(code, { lang: (lang || "text") as BundledLanguage, ...options })
      .catch(() => codeToHtml(code, { lang: "text", ...options }))
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, COPY_RESET_MS);
    });
  };

  return (
    <div
      dir="ltr"
      className="my-2 overflow-hidden rounded-md border border-neutral-200 text-start dark:border-neutral-800"
    >
      <div className="flex items-center justify-between gap-2 bg-neutral-100 px-3 py-1.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
        <span className="truncate font-mono">{filename ?? lang}</span>
        <Button variant="ghost" size="sm" onClick={handleCopy} aria-label={t("chat.copyCode")}>
          {copied ? <Check /> : <Copy />}
          <span>{copied ? t("chat.copied") : t("chat.copy")}</span>
        </Button>
      </div>
      {html ? (
        <div
          className="overflow-x-auto text-sm [&_pre]:m-0 [&_pre]:!bg-transparent [&_pre]:p-3"
          // Shiki's own output — tokenized/escaped code text, not arbitrary user HTML.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3 text-sm">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
