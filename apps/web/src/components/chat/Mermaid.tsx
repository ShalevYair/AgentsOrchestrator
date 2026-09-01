import * as React from "react";
import mermaid from "mermaid";

export interface MermaidProps {
  code: string;
}

let counter = 0;

/** P2-T5: fenced ```mermaid blocks render to SVG client-side. */
export function Mermaid({ code }: MermaidProps): React.JSX.Element {
  const [svg, setSvg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const idRef = React.useRef<string>();
  idRef.current ??= `ao-mermaid-${String((counter += 1))}`;

  React.useEffect(() => {
    let cancelled = false;
    const isDark = document.documentElement.classList.contains("dark");
    mermaid.initialize({ startOnLoad: false, theme: isDark ? "dark" : "default", securityLevel: "strict" });
    mermaid
      .render(idRef.current ?? "ao-mermaid", code)
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <pre
        dir="ltr"
        className="my-2 overflow-x-auto rounded-md border border-red-300 bg-red-50 p-3 text-start text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
      >
        {code}
      </pre>
    );
  }
  if (!svg) {
    return <div className="my-2 h-24 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />;
  }
  return (
    <div
      className="my-2 flex justify-center overflow-x-auto"
      // Mermaid's own rendered SVG output.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
