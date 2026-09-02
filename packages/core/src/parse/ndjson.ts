import { createHash } from "node:crypto";
import { NdjsonEnvelopeSchema, type DoneEnvelope, type NdjsonEnvelope } from "@ao/shared";

/** PROTOCOLS.md §3, rule 6's threshold: "schemaViolations / totalLines > 0.15 → הכשלת ה-Task". */
export const VIOLATION_RATIO_THRESHOLD = 0.15;

export interface AssembledFile {
  id: string;
  path: string;
  op: "create" | "update" | "delete" | "rename";
  encoding: "utf8" | "base64";
  /** The concatenated chunk payload, still in `encoding`'s wire form (base64 stays base64) — decoding to bytes is ArtifactWriter's job (P8), not the parser's. */
  data: string;
  sha256: string;
  lines: number;
}

export type PartialFileReason = "missing-file-end" | "sha256-mismatch";

export interface PartialFile {
  id: string;
  path: string;
  reason: PartialFileReason;
  /** Only set for a "sha256-mismatch" — the hash actually computed from the assembled chunks, for diagnostics. */
  computedSha256?: string;
}

export interface NdjsonParseResult {
  /** Every schema-valid envelope, in stream order — this is what `task.delta` (PROTOCOLS.md §9) streams to the UI. Includes file_begin/file_chunk/file_end and tool_result alongside finding/note/section/done. */
  envelopes: NdjsonEnvelope[];
  /** Files whose file_begin -> file_chunk* -> file_end sequence completed AND whose reassembled sha256 matched (rule 5). */
  files: AssembledFile[];
  /** file_begin sequences that never got a matching file_end (rule 4), or whose sha256 didn't match (rule 5) — never written. */
  partialFiles: PartialFile[];
  /** Count of file_chunk lines that arrived with no open file_begin of the same id (rule 4) — dropped, not written anywhere. Tracked separately from schemaViolations because the line itself is schema-valid; the problem is protocol ordering, not JSON/schema shape. */
  orphanedChunkCount: number;
  /** Rule 1: lines that failed to parse as JSON, or parsed but didn't match any NdjsonEnvelope variant. */
  schemaViolations: number;
  /** Non-empty lines actually evaluated — excludes a truncated trailing line dropped under rule 2. */
  totalLines: number;
  /** `schemaViolations / totalLines > 0.15` (0 lines => false, nothing to violate). */
  violationRatioExceeded: boolean;
  /** True once a `{"t":"done"}` envelope was seen. */
  done: boolean;
  doneEnvelope: DoneEnvelope | undefined;
  /** The last envelope that parsed successfully, in stream order — PROTOCOLS.md §5's "lastComplete" anchor for a continuation request. `undefined` if nothing parsed at all. */
  lastCompleteEnvelope: NdjsonEnvelope | undefined;
}

interface OpenFile {
  id: string;
  path: string;
  op: "create" | "update" | "delete" | "rename";
  encoding: "utf8" | "base64";
  chunks: { seq: number; data: string }[];
}

function computeSha256(data: string, encoding: "utf8" | "base64"): string {
  const buffer = encoding === "base64" ? Buffer.from(data, "base64") : Buffer.from(data, "utf8");
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * P5-T7 — parses one agent response's full NDJSON output per PROTOCOLS.md
 * §3's 6 rules. Pure and synchronous; never throws, regardless of what
 * `text` contains — this is deliberately the exact property the fuzz test
 * (parse.test.ts) exercises on every truncation offset of a real stream.
 *
 * `text` is the *entire* buffer accumulated so far (whether the response is
 * complete or still mid-stream/truncated) — this function re-derives the
 * full parse result from scratch each call rather than maintaining
 * incremental state, which is intentionally simple at this scale (a single
 * agent response is capped at `maxOutputTokens`, itself capped well under
 * 64K tokens per stage — see PROTOCOLS.md §1's outputContract).
 */
export function parseNdjson(text: string): NdjsonParseResult {
  const rawLines = text.split("\n");
  // A trailing newline means every element before the final "" is a
  // complete line — nothing left over to excuse. Without one, the last
  // element is whatever the stream had written so far when it was cut
  // (rule 2's "partial trailing line"), so it gets special, non-punitive
  // handling below instead of joining the normal per-line loop.
  const endsWithNewline = text.length === 0 || text.endsWith("\n");
  const lastIndex = rawLines.length - 1;

  const envelopes: NdjsonEnvelope[] = [];
  const openFiles = new Map<string, OpenFile>();
  const completedFiles: AssembledFile[] = [];
  const partialFiles: PartialFile[] = [];
  let orphanedChunkCount = 0;
  let schemaViolations = 0;
  let totalLines = 0;
  let done = false;
  let doneEnvelope: DoneEnvelope | undefined;
  let lastCompleteEnvelope: NdjsonEnvelope | undefined;

  function tryParseLine(raw: string): NdjsonEnvelope | undefined {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return undefined;
    }
    const result = NdjsonEnvelopeSchema.safeParse(json);
    return result.success ? result.data : undefined;
  }

  function handleEnvelope(envelope: NdjsonEnvelope): void {
    envelopes.push(envelope);
    lastCompleteEnvelope = envelope;

    switch (envelope.t) {
      case "file_begin": {
        openFiles.set(envelope.id, {
          id: envelope.id,
          path: envelope.path,
          op: envelope.op,
          encoding: envelope.encoding,
          chunks: [],
        });
        break;
      }
      case "file_chunk": {
        const open = openFiles.get(envelope.id);
        if (!open) {
          orphanedChunkCount += 1;
          break;
        }
        open.chunks.push({ seq: envelope.seq, data: envelope.data });
        break;
      }
      case "file_end": {
        const open = openFiles.get(envelope.id);
        if (!open) {
          // A file_end with no matching file_begin is symmetrically
          // orphaned — nothing to assemble, nothing to mark partial either
          // since we never had a path/op for it.
          break;
        }
        openFiles.delete(envelope.id);
        const assembled = [...open.chunks]
          .sort((a, b) => a.seq - b.seq)
          .map((c) => c.data)
          .join("");
        const computed = computeSha256(assembled, open.encoding);
        if (computed !== envelope.sha256) {
          partialFiles.push({
            id: open.id,
            path: open.path,
            reason: "sha256-mismatch",
            computedSha256: computed,
          });
        } else {
          completedFiles.push({
            id: open.id,
            path: open.path,
            op: open.op,
            encoding: open.encoding,
            data: assembled,
            sha256: computed,
            lines: envelope.lines,
          });
        }
        break;
      }
      case "done": {
        done = true;
        doneEnvelope = envelope;
        break;
      }
      default:
        break;
    }
  }

  rawLines.forEach((raw, index) => {
    const isTrailingUnterminated = !endsWithNewline && index === lastIndex;
    const line = raw.trim();
    if (line.length === 0) return; // blank lines carry no information either way

    if (isTrailingUnterminated) {
      // Rule 2: try it anyway (the stream may have ended exactly on a
      // newline boundary in substance, just not textually) — but on any
      // failure, drop it silently. Never counted toward totalLines or
      // schemaViolations either way.
      const envelope = tryParseLine(line);
      if (envelope) handleEnvelope(envelope);
      return;
    }

    totalLines += 1;
    const envelope = tryParseLine(line);
    if (!envelope) {
      schemaViolations += 1;
      return;
    }
    handleEnvelope(envelope);
  });

  // Rule 4: any file_begin never closed by a file_end is left in
  // `openFiles` at this point — partial, and never written.
  for (const open of openFiles.values()) {
    partialFiles.push({ id: open.id, path: open.path, reason: "missing-file-end" });
  }

  return {
    envelopes,
    files: completedFiles,
    partialFiles,
    orphanedChunkCount,
    schemaViolations,
    totalLines,
    violationRatioExceeded: totalLines > 0 && schemaViolations / totalLines > VIOLATION_RATIO_THRESHOLD,
    done,
    doneEnvelope,
    lastCompleteEnvelope,
  };
}
