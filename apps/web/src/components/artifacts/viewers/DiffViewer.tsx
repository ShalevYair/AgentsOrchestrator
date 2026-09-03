import * as React from "react";
import { cn } from "../../../lib/utils.js";

export interface DiffViewerProps {
  /** Unified-diff text (` `/`+`/`-`-prefixed lines) — the same shape `@ao/core`'s `formatUnifiedDiff` (P8-T7) produces server-side. This component only ever renders a string it's handed; it never computes a diff itself (diffing is server/`@ao/core` work, not browser work). */
  diffText: string;
  className?: string;
}

type DiffLineKind = "added" | "removed" | "context";

function classify(line: string): { kind: DiffLineKind; text: string } {
  if (line.startsWith("+")) return { kind: "added", text: line.slice(1) };
  if (line.startsWith("-")) return { kind: "removed", text: line.slice(1) };
  return { kind: "context", text: line.startsWith(" ") ? line.slice(1) : line };
}

const LINE_CLASSES: Record<DiffLineKind, string> = {
  added: "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300",
  removed: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300",
  context: "text-neutral-600 dark:text-neutral-400",
};

const LINE_MARKER: Record<DiffLineKind, string> = { added: "+", removed: "-", context: " " };

/** P8-T8's "דיף" preview — renders already-computed unified-diff text with +/- coloring. Always an LTR container (diff content is source text/identifiers, same UX.md §9 rule `CodeBlock` follows). */
export function DiffViewer({ diffText, className }: DiffViewerProps): React.JSX.Element {
  const lines = diffText.length === 0 ? [] : diffText.split("\n").map(classify);
  return (
    <div
      dir="ltr"
      className={cn(
        "overflow-x-auto rounded-md border border-neutral-200 font-mono text-sm dark:border-neutral-800",
        className,
      )}
    >
      {lines.map((line, index) => (
        <div key={index} className={cn("whitespace-pre px-3 py-0.5", LINE_CLASSES[line.kind])}>
          <span className="select-none text-neutral-400">{LINE_MARKER[line.kind]}</span> {line.text}
        </div>
      ))}
    </div>
  );
}
