import * as XLSX from "xlsx";
import type { SpreadsheetSheet, SpreadsheetStructure, ExtractedText } from "./types.js";

/** Per ARCHITECTURE.md §5.1: schema, ranges and statistics — not all rows.
 * We keep a bounded preview per sheet so downstream chunking/context
 * selection has something concrete to show without re-embedding the whole
 * spreadsheet. */
const MAX_SAMPLE_ROWS = 20;

export function extractSpreadsheet(data: Uint8Array, kind: "xlsx" | "csv"): ExtractedText {
  const buffer = Buffer.from(data);
  const workbook =
    kind === "csv" ? XLSX.read(buffer, { type: "buffer", raw: true }) : XLSX.read(buffer, { type: "buffer" });

  const sheets: SpreadsheetSheet[] = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows: unknown[][] = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) : [];
    const headers = (rows[0] ?? []).map((cell) => cellToText(cell));
    const dataRows = rows.slice(1);
    return {
      name,
      rowCount: dataRows.length,
      colCount: headers.length,
      headers,
      sampleRows: dataRows.slice(0, MAX_SAMPLE_ROWS),
    };
  });

  const structure: SpreadsheetStructure = { sheets };
  const text = sheets.map(renderSheetPreview).join("\n\n");

  return { kind, text, structure, warnings: [], failed: false };
}

function renderSheetPreview(sheet: SpreadsheetSheet): string {
  const lines = [
    `# ${sheet.name} (${String(sheet.rowCount)} rows x ${String(sheet.colCount)} cols)`,
    sheet.headers.join(","),
  ];
  for (const row of sheet.sampleRows) {
    lines.push(row.map((cell) => cellToText(cell)).join(","));
  }
  const remaining = sheet.rowCount - sheet.sampleRows.length;
  if (remaining > 0) lines.push(`... ${String(remaining)} more rows`);
  return lines.join("\n");
}

function cellToText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  if (cell instanceof Date) return cell.toISOString();
  return JSON.stringify(cell);
}
