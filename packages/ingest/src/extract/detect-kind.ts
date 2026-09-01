import { extname } from "node:path";
import type { ExtractorKind } from "./types.js";

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".java", ".go", ".rs", ".rb", ".php", ".c", ".h", ".cpp", ".cc",
  ".hpp", ".cs", ".swift", ".kt", ".kts", ".scala", ".sh", ".bash", ".zsh",
  ".ps1", ".sql", ".yaml", ".yml", ".json", ".jsonc", ".toml", ".ini",
  ".xml", ".vue", ".svelte", ".md", ".mdx", ".txt", ".html", ".htm",
  ".css", ".scss", ".sass", ".less", ".graphql", ".proto", ".env",
  ".gitignore", ".aoignore", ".dockerfile", ".lock",
]); // prettier-ignore

const PDF_EXTENSIONS = new Set([".pdf"]);
const DOCX_EXTENSIONS = new Set([".docx"]);
const PPTX_EXTENSIONS = new Set([".pptx"]);
const SPREADSHEET_EXTENSIONS = new Set([".xlsx", ".xlsm", ".xls"]);
const CSV_EXTENSIONS = new Set([".csv", ".tsv"]);
const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico", ".tiff",
]); // prettier-ignore
const ARCHIVE_EXTENSIONS = new Set([".zip"]);

/**
 * Extension-first, content-sniff fallback. Extension is trusted because
 * it's what the user/tool named the file; the sniff only kicks in for
 * extensionless or unrecognized files (P3-T3's "binary לא מוכר" bucket).
 */
export function detectKind(path: string, data: Uint8Array): ExtractorKind {
  const ext = extname(path).toLowerCase();

  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  if (DOCX_EXTENSIONS.has(ext)) return "docx";
  if (PPTX_EXTENSIONS.has(ext)) return "pptx";
  if (SPREADSHEET_EXTENSIONS.has(ext)) return "xlsx";
  if (CSV_EXTENSIONS.has(ext)) return "csv";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ARCHIVE_EXTENSIONS.has(ext)) return "archive";
  if (CODE_EXTENSIONS.has(ext)) return "code";

  return sniff(data);
}

const MAGIC_BYTES: { kind: ExtractorKind; bytes: number[] }[] = [
  { kind: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { kind: "image", bytes: [0x89, 0x50, 0x4e, 0x47] }, // PNG
  { kind: "image", bytes: [0xff, 0xd8, 0xff] }, // JPEG
  { kind: "image", bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { kind: "archive", bytes: [0x50, 0x4b, 0x03, 0x04] }, // ZIP local file header
  { kind: "archive", bytes: [0x50, 0x4b, 0x05, 0x06] }, // ZIP empty archive
  // Known non-text binary signatures — checked before the text sniff so a
  // stray ELF/PE/gzip header (which may contain no NUL byte in its first
  // few bytes) doesn't get misread as plain text.
  { kind: "binary", bytes: [0x7f, 0x45, 0x4c, 0x46] }, // ELF
  { kind: "binary", bytes: [0x4d, 0x5a] }, // PE/DOS "MZ"
  { kind: "binary", bytes: [0x1f, 0x8b] }, // gzip
  { kind: "binary", bytes: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65] }, // SQLite
];

function sniff(data: Uint8Array): ExtractorKind {
  for (const { kind, bytes } of MAGIC_BYTES) {
    if (startsWith(data, bytes)) return kind;
  }
  return looksLikeText(data) ? "code" : "binary";
}

function startsWith(data: Uint8Array, prefix: number[]): boolean {
  if (data.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (data[i] !== prefix[i]) return false;
  }
  return true;
}

/** A NUL byte anywhere in the first 8KB is a strong binary signal — real
 * text files (including UTF-16, which we don't otherwise support) don't
 * contain them in practice for the plain-ASCII/UTF-8 case we handle. */
function looksLikeText(data: Uint8Array): boolean {
  const sample = data.subarray(0, 8192);
  for (const byte of sample) {
    if (byte === 0) return false;
  }
  return true;
}
