import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { remarkCodeMeta } from "../../lib/remark-code-meta.js";
import { cn } from "../../lib/utils.js";
import { CodeBlock } from "./CodeBlock.js";
import { Mermaid } from "./Mermaid.js";

export interface MarkdownProps {
  content: string;
  className?: string;
}

interface CodeElementProps {
  className?: string;
  children?: React.ReactNode;
  "data-meta"?: string;
}

function extractText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : ""))
    .join("")
    .replace(/\n$/, "");
}

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkCodeMeta];
const REHYPE_PLUGINS = [rehypeKatex];

/**
 * P2-T5: GFM + Shiki code blocks + Mermaid + KaTeX.
 *
 * UX.md §9's required bidi behavior: this component never sets `dir` on
 * itself (it inherits the surrounding paragraph's direction, RTL by
 * default), but every inline `<code>` is wrapped in `<bdi dir="ltr">` and
 * every fenced block (CodeBlock / Mermaid) is its own `dir="ltr"`
 * container — so code and identifiers stay LTR islands inside RTL flow
 * exactly as required, verified in Markdown.test.tsx.
 */
export function Markdown({ content, className }: MarkdownProps): React.JSX.Element {
  return (
    <div className={cn("md", className)}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={{
          pre({ children }) {
            const child = React.Children.only(children) as React.ReactElement<CodeElementProps>;
            const className = child.props.className ?? "";
            const lang = /language-(\S+)/.exec(className)?.[1] ?? "text";
            const raw = extractText(child.props.children);
            if (lang === "mermaid") return <Mermaid code={raw} />;
            const meta = child.props["data-meta"];
            const filename = meta ? /filename=["']?([^"'\s]+)["']?/.exec(meta)?.[1] : undefined;
            return <CodeBlock code={raw} lang={lang} filename={filename} />;
          },
          code({ className, children, ...props }) {
            return (
              <bdi dir="ltr">
                <code
                  className={cn(
                    "rounded bg-neutral-100 px-1 py-0.5 text-[0.85em] dark:bg-neutral-800",
                    className,
                  )}
                  {...props}
                >
                  {children}
                </code>
              </bdi>
            );
          },
          a({ className, children, ...props }) {
            return (
              <a className={cn("underline underline-offset-2", className)} {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
