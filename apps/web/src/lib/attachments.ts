import { estimateTokens, type TokenKind } from "@ao/ingest/tokens";
import { classifyArtifactViewer, type ArtifactViewerKind } from "./artifact-kind.js";

export type AttachmentStatus = "ready" | "unsupported" | "too-large" | "read-error";

export interface AttachmentState {
  id: string;
  file: File;
  kind: ArtifactViewerKind;
  status: AttachmentStatus;
  /** Real (`estimateTokens`, P3-T9) for text-readable kinds; `null` when this file's content was never read (binary kind, or over `MAX_ESTIMATABLE_BYTES`) — never a guess. */
  estimatedTokens: number | null;
  /** The file's text content, read once at attach time and reused for `composeMessageWithAttachments` — `null` for anything not actually read (same cases as `estimatedTokens: null`). */
  content: string | null;
}

/**
 * Reading a file into one JS string is fine at ordinary source-file sizes;
 * a much larger one risks a multi-second UI freeze for a browser tab, so
 * this caps what P9-T8 will even attempt to read, independent of the
 * *token* budget (BUDGET.md's own limits) — this is purely "don't hang
 * the tab," checked before any read is attempted.
 */
export const MAX_ESTIMATABLE_BYTES = 10_000_000;

/**
 * UX.md §2's card wants an estimate for "every" attached file, but only
 * these kinds are ever read as text client-side — `classifyArtifactViewer`
 * (P8) already tells us which extensions are text-shaped. Binary kinds
 * (image, zip) have no text to estimate from without real multimodal
 * token accounting or archive extraction, neither of which exists here —
 * shown as "not available", never a fabricated number.
 */
const TEXT_KINDS: ReadonlySet<ArtifactViewerKind> = new Set(["code", "markdown", "text", "table"]);

function tokenKindFor(kind: ArtifactViewerKind): TokenKind {
  return kind === "code" ? "code" : "mixed";
}

export function isEstimatableKind(kind: ArtifactViewerKind): boolean {
  return TEXT_KINDS.has(kind);
}

/** `FileReader` rather than the newer `File.prototype.text()` — the latter is unimplemented in this project's jsdom test environment (25.x); `FileReader` is the one text-reading API guaranteed to work identically in every real browser and here. */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(new Error(reader.error?.message ?? `failed to read ${file.name}`));
    };
    reader.readAsText(file);
  });
}

/** Reads and estimates one attached file — the only async step. */
export async function buildAttachmentState(file: File): Promise<AttachmentState> {
  const kind = classifyArtifactViewer(file.name);
  const id = `${file.name}:${String(file.size)}:${String(file.lastModified)}`;

  if (!isEstimatableKind(kind)) {
    return { id, file, kind, status: "unsupported", estimatedTokens: null, content: null };
  }
  if (file.size > MAX_ESTIMATABLE_BYTES) {
    return { id, file, kind, status: "too-large", estimatedTokens: null, content: null };
  }

  // A read failure (permission revoked mid-pick, file deleted on disk,
  // etc.) must resolve — never reject — so one bad file in a multi-file
  // `Promise.all` batch (ChatInput's `addFiles`) can't silently drop every
  // other attachment in the same batch.
  try {
    const content = await readAsText(file);
    return {
      id,
      file,
      kind,
      status: "ready",
      estimatedTokens: estimateTokens(content, tokenKindFor(kind)),
      content,
    };
  } catch {
    return { id, file, kind, status: "read-error", estimatedTokens: null, content: null };
  }
}

export function sumEstimatedTokens(attachments: readonly AttachmentState[]): number {
  return attachments.reduce((sum, a) => sum + (a.estimatedTokens ?? 0), 0);
}

/**
 * What actually reaches the model: the user's typed text, plus one
 * rendered section per attachment (real content for a "ready" file, a
 * plain note for anything unread) — not just a composer-only preview the
 * send button silently discards. `renderSection` is injected so the
 * caller's own `t()` decides the label text/locale; this stays pure.
 */
export function composeMessageWithAttachments(
  text: string,
  attachments: readonly AttachmentState[],
  renderSection: (attachment: AttachmentState) => string,
): string {
  if (attachments.length === 0) return text;
  const sections = attachments.map(renderSection).filter((s) => s.length > 0);
  return [text, ...sections].filter((s) => s.length > 0).join("\n\n");
}
