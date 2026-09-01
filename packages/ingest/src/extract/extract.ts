import { detectKind } from "./detect-kind.js";
import { extractCode } from "./code.js";
import { extractPdf } from "./pdf.js";
import { extractDocx } from "./docx.js";
import { extractPptx } from "./pptx.js";
import { extractSpreadsheet } from "./spreadsheet.js";
import { extractImage } from "./image.js";
import { extractArchive } from "./archive.js";
import { extractBinary } from "./binary.js";
import type { ExtractedText, ExtractorKind } from "./types.js";

export type { ExtractedText, ExtractorKind } from "./types.js";
export { detectKind } from "./detect-kind.js";
export { unpackArchive } from "./archive.js";

/**
 * Runs the right extractor for `path`/`data` and never throws — a broken
 * PDF, a truncated zip, a docx with garbage XML all come back as
 * `failed: true` with the reason in `warnings` instead of aborting whatever
 * batch called this (P3-T3 done criterion: one corrupt file never takes
 * down the group).
 */
export async function extractArtifact(path: string, data: Uint8Array): Promise<ExtractedText> {
  const kind = detectKind(path, data);
  try {
    return await runExtractor(kind, data);
  } catch (err) {
    return {
      kind,
      text: "",
      structure: undefined,
      warnings: [`extraction failed: ${errorMessage(err)}`],
      failed: true,
    };
  }
}

async function runExtractor(kind: ExtractorKind, data: Uint8Array): Promise<ExtractedText> {
  switch (kind) {
    case "code":
      return extractCode(data);
    case "pdf":
      return extractPdf(data);
    case "docx":
      return extractDocx(data);
    case "pptx":
      return extractPptx(data);
    case "xlsx":
    case "csv":
      return extractSpreadsheet(data, kind);
    case "image":
      return extractImage(data);
    case "archive":
      return extractArchive(data);
    case "binary":
      return extractBinary(data);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
