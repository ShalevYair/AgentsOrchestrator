/**
 * P8-T8 — "תצוגה לכל סוג נפוץ" (UX.md §6's "כרטיס ארטיפקט": code / Markdown
 * / image / table→CSV). Pure filename→viewer classification — no network,
 * no dependency on any specific artifact's content, so it's trivially
 * unit-testable and reusable from anywhere in the app that needs to know
 * "how would this artifact be shown".
 *
 * `diff` is deliberately not a member of this union: UX.md §6 shows it as
 * an *additional* element alongside a base preview ("דיף מול המקור **אם
 * זה עדכון**"), not a preview kind of its own — `ArtifactCard` renders a
 * `DiffViewer` section on top of whichever base kind applies, when the
 * caller supplies diff text, rather than switching to a different kind.
 */
export type ArtifactViewerKind = "code" | "markdown" | "image" | "table" | "zip" | "text";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);
const TABLE_EXTENSIONS = new Set(["csv", "tsv"]);
const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "json",
  "jsonc",
  "yaml",
  "yml",
  "css",
  "html",
  "htm",
  "sh",
  "bash",
  "go",
  "rs",
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "rb",
  "php",
  "sql",
  "toml",
  "xml",
]);

function extensionOf(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex === -1 ? "" : filename.slice(dotIndex + 1).toLowerCase();
}

export function classifyArtifactViewer(filename: string): ArtifactViewerKind {
  const ext = extensionOf(filename);
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "zip") return "zip";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (TABLE_EXTENSIONS.has(ext)) return "table";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  return "text";
}

/** Shiki language id for `CodeBlock` — a small, deliberately partial mapping (the extensions this viewer actually classifies as `"code"`), falling back to the extension itself, which Shiki resolves for most common languages anyway. */
export function shikiLangFor(filename: string): string {
  const ext = extensionOf(filename);
  const aliases: Record<string, string> = { mjs: "js", cjs: "js", htm: "html", h: "c", hpp: "cpp" };
  return aliases[ext] ?? (ext || "text");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
