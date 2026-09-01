export interface ChunkLoc {
  /** 1-based, inclusive line range of this chunk's authoritative (non
   * -overlap) span — what evidence citations point at
   * (PROTOCOLS.md §3: `"loc":"src/x.ts:40-58"`). */
  startLine: number;
  endLine: number;
  /** Char offsets into the original text, exclusive end. */
  startOffset: number;
  endOffset: number;
}

export interface Chunk {
  id: string;
  artifactId: string;
  index: number;
  /** Includes leading overlap from the previous chunk's tail, for reading
   * continuity. `loc` below still points at just this chunk's own
   * non-overlapping span. */
  text: string;
  loc: ChunkLoc;
}

export interface ChunkOptions {
  /** Target size of a chunk's own (non-overlap) span, in characters. */
  maxChars?: number;
  /** How much of the previous chunk's tail to prepend to the next chunk. */
  overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_OVERLAP_CHARS = 200;

const HEADING_RE = /^#{1,6}\s/;
const TOP_LEVEL_DECL_RE =
  /^(export\s+)?(default\s+)?(async\s+)?(function|class|interface|type|enum|def|public|private|protected|module\.exports)\b/;

interface Line {
  text: string;
  start: number;
  end: number; // exclusive, includes the line's own newline if present
}

/**
 * Splits `text` into chunks along structural boundaries (blank lines,
 * Markdown headings, top-level declarations) with overlap between adjacent
 * chunks, and a precise, non-overlapping `loc` per chunk for citations
 * (P3-T4). The non-overlapping spans partition `text` exactly — see the
 * round-trip test in chunk.test.ts.
 */
export function chunkText(artifactId: string, text: string, options: ChunkOptions = {}): Chunk[] {
  if (text.length === 0) return [];

  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const lines = splitLines(text);

  const boundaries = coreBoundaries(lines, maxChars);
  const chunks: Chunk[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const bound = boundaries[i];
    if (!bound) continue;
    const { startLineIdx, endLineIdx } = bound;
    const firstLine = lines[startLineIdx];
    const lastLine = lines[endLineIdx - 1];
    if (!firstLine || !lastLine) continue;

    const coreStart = firstLine.start;
    const coreEnd = lastLine.end;

    // Overlap reaches back into the previous chunk's tail, but never past
    // that chunk's own start (so overlap never spans more than one chunk).
    const previousCoreStart = i > 0 ? (lines[boundaries[i - 1]?.startLineIdx ?? 0]?.start ?? 0) : coreStart;
    const overlapFloor = Math.max(coreStart - overlapChars, previousCoreStart, 0);
    const textStart = i === 0 ? coreStart : snapToLineStart(lines, overlapFloor);

    chunks.push({
      id: `${artifactId}#${String(i)}`,
      artifactId,
      index: i,
      text: text.slice(textStart, coreEnd),
      loc: {
        startLine: startLineIdx + 1,
        endLine: endLineIdx,
        startOffset: coreStart,
        endOffset: coreEnd,
      },
    });
  }

  return chunks;
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start <= text.length) {
    const nlIndex = text.indexOf("\n", start);
    if (nlIndex === -1) {
      if (start < text.length) lines.push({ text: text.slice(start), start, end: text.length });
      break;
    }
    lines.push({ text: text.slice(start, nlIndex + 1), start, end: nlIndex + 1 });
    start = nlIndex + 1;
  }
  return lines;
}

function isBoundaryLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || HEADING_RE.test(line) || TOP_LEVEL_DECL_RE.test(trimmed);
}

/** Greedily partitions `lines` into contiguous, non-overlapping spans of
 * roughly `maxChars`, preferring to end a span right before the last
 * structural-boundary line seen in the current window so cuts land on
 * function/heading/paragraph edges rather than mid-statement. Always makes
 * progress (a single line longer than maxChars still becomes its own
 * chunk) so pathological input can't loop forever. */
function coreBoundaries(lines: Line[], maxChars: number): { startLineIdx: number; endLineIdx: number }[] {
  const spans: { startLineIdx: number; endLineIdx: number }[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    let end = cursor;
    let charCount = 0;
    let lastBoundaryEnd = -1; // line index *after* the best cut point found so far

    while (end < lines.length) {
      const line = lines[end];
      if (!line) break;
      const lineLen = line.end - line.start;
      if (charCount + lineLen > maxChars && end > cursor) break;
      charCount += lineLen;
      end++;
      if (end < lines.length && end > cursor && isBoundaryLine(lines[end]?.text ?? "")) {
        lastBoundaryEnd = end;
      }
    }

    const cut = lastBoundaryEnd > cursor && lastBoundaryEnd < end ? lastBoundaryEnd : end;
    spans.push({ startLineIdx: cursor, endLineIdx: Math.max(cut, cursor + 1) });
    cursor = Math.max(cut, cursor + 1);
  }

  return spans;
}

/** Snaps `offset` back to the start of the line containing it (never
 * forward) — so overlap never rounds away to nothing just because it
 * landed inside one long line. */
function snapToLineStart(lines: Line[], offset: number): number {
  let start = 0;
  for (const line of lines) {
    if (line.start > offset) break;
    start = line.start;
  }
  return start;
}
