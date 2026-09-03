/** A table cell can in principle hold anything JSON-serializable, not just primitives — `String(value)` on an object/array would silently degrade to `"[object Object]"`, so those are rendered as JSON instead of guessing a "nicer" format. Exported so `TableViewer`'s on-screen rendering and this module's CSV export agree on exactly the same text for the same cell. */
export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  // The object case (the only one that could yield "[object Object]") is
  // already handled above — everything reaching here is a primitive.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value);
}

/** P8-T8 — "טבלה ל-CSV". RFC 4180-ish: quotes a field only when it needs it (contains a comma, quote, or newline), doubling embedded quotes. */
function escapeCsvField(value: unknown): string {
  const text = cellToText(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Converts row objects into CSV text, columns in the order the first row's keys appear. Every row is expected to share the same shape (this is a display/export convenience for already-tabular data, not a schema reconciler) — a row missing a key just yields an empty cell there. Empty input yields an empty string, not a header-only CSV with no columns to name. */
export function rowsToCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(",")),
  ];
  return lines.join("\n");
}

/** Splits one CSV/TSV record line into fields, honoring quoted fields that may contain the delimiter, a doubled quote, or an embedded newline (so a raw `\n`-split of the whole text first would be wrong for such a field — `parseCsv` below runs this over the whole text char-by-char rather than pre-splitting into lines for that reason). */
function parseRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      field = "";
      record = [];
    } else {
      field += char;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/** The read side of `rowsToCsv` — parses CSV/TSV text (the raw bytes of a `.csv`/`.tsv` artifact) back into row objects keyed by the header row, for `TableViewer`'s display. Not a general-purpose CSV library (no dialect options, no streaming) — a small, honestly-scoped parser for exactly the artifact-preview use case, mirroring `rowsToCsv`'s own escaping rules in reverse. */
export function parseCsv(text: string, delimiter: "," | "\t" = ","): Record<string, string>[] {
  const records = parseRecords(text, delimiter).filter((r) => !(r.length === 1 && r[0] === ""));
  if (records.length === 0) return [];
  const [header, ...rows] = records;
  return rows.map((row) => Object.fromEntries(header!.map((key, index) => [key, row[index] ?? ""])));
}
