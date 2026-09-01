export type ExtractorKind =
  "code" | "pdf" | "docx" | "pptx" | "xlsx" | "csv" | "image" | "archive" | "binary";

export interface CodeStructure {
  lineCount: number;
}

export interface PdfStructure {
  pageCount: number;
}

export interface DocxStructure {
  warnings: string[];
}

export interface PptxStructure {
  slideCount: number;
}

export interface SpreadsheetSheet {
  name: string;
  rowCount: number;
  colCount: number;
  headers: string[];
  sampleRows: unknown[][];
}

export interface SpreadsheetStructure {
  sheets: SpreadsheetSheet[];
}

export interface ImageStructure {
  width: number | undefined;
  height: number | undefined;
  format: string | undefined;
}

export interface ArchiveEntry {
  path: string;
  sizeBytes: number;
  data: Uint8Array;
}

export interface ArchiveStructure {
  entryCount: number;
  entries: { path: string; sizeBytes: number }[];
}

export interface BinaryStructure {
  detectedType: string | undefined;
}

export type ExtractStructure =
  | CodeStructure
  | PdfStructure
  | DocxStructure
  | PptxStructure
  | SpreadsheetStructure
  | ImageStructure
  | ArchiveStructure
  | BinaryStructure;

/** Result of extracting one artifact. `text` is "" for kinds with no text
 * body (image, binary, empty archive). Extraction never throws past the
 * dispatcher — a failure is represented as `failed: true` with a reason in
 * `warnings`, so one corrupt file never aborts a batch (P3-T3 done
 * criterion). */
export interface ExtractedText {
  kind: ExtractorKind;
  text: string;
  structure: ExtractStructure | undefined;
  warnings: string[];
  failed: boolean;
}
