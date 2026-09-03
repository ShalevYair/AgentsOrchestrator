/**
 * P8-T7 — the diff half of "כתיבה לתיקייה": UX.md §6's "כרטיס ארטיפקט"
 * always shows a diff against the original before an overwrite is even
 * offered for approval. A minimal line-level unified-diff, not a
 * dependency: no `diff`-family package exists anywhere in this monorepo
 * yet, and the need here (readable line +/-/context for a human approval
 * screen) doesn't call for a byte-level or word-level diff algorithm.
 *
 * Classic dynamic-programming LCS — `O(n·m)` in the two files' line
 * counts. Fine for the individual source files this is meant for
 * (hundreds of lines); not meant for diffing huge generated data dumps.
 * Documented rather than hidden, the same honest-scoping style every
 * other "not the fanciest possible algorithm, chosen deliberately" note
 * in this codebase already uses (e.g. P7-T5's regex-based identifier
 * counter, explicitly not real AST).
 */
export type DiffLineKind = "context" | "added" | "removed";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.split("\n");
}

/** Longest-common-subsequence length table for two line arrays. */
function lcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

/**
 * Line-level diff between `before` and `after`. Deterministic and pure —
 * same two strings always produce the same `DiffLine[]`, no dependence on
 * insertion order or Map/Set iteration.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const table = lcsTable(a, b);

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: "context", text: a[i]! });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      lines.push({ kind: "removed", text: a[i]! });
      i += 1;
    } else {
      lines.push({ kind: "added", text: b[j]! });
      j += 1;
    }
  }
  while (i < a.length) {
    lines.push({ kind: "removed", text: a[i]! });
    i += 1;
  }
  while (j < b.length) {
    lines.push({ kind: "added", text: b[j]! });
    j += 1;
  }
  return lines;
}

/** Renders `diffLines`' output as familiar `+`/`-`/` `-prefixed unified-diff-style text, for a human approval screen or a log. */
export function formatUnifiedDiff(lines: readonly DiffLine[]): string {
  const prefix: Record<DiffLineKind, string> = { context: " ", added: "+", removed: "-" };
  return lines.map((line) => `${prefix[line.kind]}${line.text}`).join("\n");
}
