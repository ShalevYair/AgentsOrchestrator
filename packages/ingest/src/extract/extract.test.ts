import { describe, expect, it } from "vitest";
import { detectKind, extractArtifact, unpackArchive } from "./extract.js";
import type {
  ArchiveStructure,
  DocxStructure,
  ImageStructure,
  PdfStructure,
  PptxStructure,
  SpreadsheetStructure,
} from "./types.js";
import * as XLSX from "xlsx";
import { makeTestDocx, makeTestPdf, makeTestPng, makeTestPptx, makeTestZip } from "./test-fixtures.js";

function makeTestXlsx(): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["name", "score"],
    ["alice", 1],
    ["bob", 2],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}

describe("detectKind", () => {
  it.each([
    ["a.ts", "code"],
    ["a.py", "code"],
    ["a.md", "code"],
    ["a.pdf", "pdf"],
    ["a.docx", "docx"],
    ["a.pptx", "pptx"],
    ["a.xlsx", "xlsx"],
    ["a.csv", "csv"],
    ["a.png", "image"],
    ["a.zip", "archive"],
  ] as const)("maps %s -> %s", (path, expected) => {
    expect(detectKind(path, new Uint8Array())).toBe(expected);
  });

  it("sniffs magic bytes when the extension is unknown", () => {
    const pdfBytes = makeTestPdf();
    expect(detectKind("noext", pdfBytes)).toBe("pdf");
  });

  it("falls back to binary for null-byte-heavy unknown content", () => {
    const data = new Uint8Array([0, 1, 2, 3, 0, 0, 0, 5]);
    expect(detectKind("noext", data)).toBe("binary");
  });

  it("falls back to text for plausible-text unknown content", () => {
    const data = new TextEncoder().encode("just some text");
    expect(detectKind("noext", data)).toBe("code");
  });
});

describe("extractArtifact — one fixture per type (P3-T3 corpus)", () => {
  it("code: decodes UTF-8 text and strips BOM", async () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from("const x = 1;\n")]);
    const result = await extractArtifact("a.ts", withBom);
    expect(result.failed).toBe(false);
    expect(result.text).toBe("const x = 1;\n");
  });

  it("pdf: extracts page text", async () => {
    const result = await extractArtifact("a.pdf", makeTestPdf("Hello PDF Ingest Test"));
    expect(result.failed).toBe(false);
    expect(result.text).toContain("Hello PDF");
    expect((result.structure as PdfStructure).pageCount).toBe(1);
  });

  it("docx: extracts paragraph text", async () => {
    const result = await extractArtifact("a.docx", makeTestDocx("Hello DOCX Ingest Test"));
    expect(result.failed).toBe(false);
    expect(result.text).toContain("Hello DOCX Ingest Test");
    expect((result.structure as DocxStructure).warnings).toEqual([]);
  });

  it("pptx: extracts slide text runs in slide order", async () => {
    const result = await extractArtifact("a.pptx", makeTestPptx(["First slide", "Second slide"]));
    expect(result.failed).toBe(false);
    expect(result.text.indexOf("First slide")).toBeLessThan(result.text.indexOf("Second slide"));
    expect((result.structure as PptxStructure).slideCount).toBe(2);
  });

  it("xlsx: extracts schema + bounded sample, not all rows", async () => {
    const result = await extractArtifact("a.xlsx", makeTestXlsx());
    expect(result.failed).toBe(false);
    const structure = result.structure as SpreadsheetStructure;
    expect(structure.sheets[0]?.headers).toEqual(["name", "score"]);
    expect(structure.sheets[0]?.rowCount).toBe(2);
    expect(result.text).toContain("alice");
  });

  it("csv: parses via the same spreadsheet path", async () => {
    const csv = new TextEncoder().encode("a,b\n1,2\n3,4\n");
    const result = await extractArtifact("a.csv", csv);
    expect(result.failed).toBe(false);
    const structure = result.structure as SpreadsheetStructure;
    expect(structure.sheets[0]?.rowCount).toBe(2);
  });

  it("image: reads metadata only, no text", async () => {
    const result = await extractArtifact("a.png", makeTestPng(16, 9));
    expect(result.failed).toBe(false);
    expect(result.text).toBe("");
    const structure = result.structure as ImageStructure;
    expect(structure).toEqual({ width: 16, height: 9, format: "png" });
  });

  it("archive: lists entries", async () => {
    const zip = makeTestZip({ "a.txt": "hi", "dir/b.txt": "bye" });
    const result = await extractArtifact("a.zip", zip);
    expect(result.failed).toBe(false);
    const structure = result.structure as ArchiveStructure;
    expect(structure.entryCount).toBe(2);
    expect(structure.entries.map((e) => e.path).sort()).toEqual(["a.txt", "dir/b.txt"]);
  });

  it("unpackArchive returns entry bytes for recursive re-ingestion", () => {
    const zip = makeTestZip({ "a.txt": "hello archive contents" });
    const entries = unpackArchive(zip);
    expect(entries).toHaveLength(1);
    expect(new TextDecoder().decode(entries[0]?.data)).toBe("hello archive contents");
  });

  it("binary: records hash-worthy bytes without crashing, no text", async () => {
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4]);
    const result = await extractArtifact("a.out", elf);
    expect(result.failed).toBe(false);
    expect(result.text).toBe("");
  });
});

describe("extractArtifact — corrupt input never throws (P3-T3 done criterion)", () => {
  it("corrupt pdf marks failed instead of throwing", async () => {
    const corrupt = new TextEncoder().encode("%PDF-1.4\nnot actually a valid pdf body");
    const result = await extractArtifact("bad.pdf", corrupt);
    expect(result.failed).toBe(true);
    expect(result.warnings[0]).toMatch(/extraction failed/);
  });

  it("corrupt docx (not a real zip) marks failed instead of throwing", async () => {
    const corrupt = new TextEncoder().encode("this is not a zip file at all");
    const result = await extractArtifact("bad.docx", corrupt);
    expect(result.failed).toBe(true);
  });

  it("corrupt xlsx (truncated zip) marks failed instead of throwing", async () => {
    // xlsx is a zip container — SheetJS is lenient about non-zip garbage
    // (it falls back to a CSV-ish read), so the realistic corruption case
    // is a truncated/broken zip, which it does reject.
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    const result = await extractArtifact("bad.xlsx", corrupt);
    expect(result.failed).toBe(true);
  });

  it("corrupt zip archive marks failed instead of throwing", async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]); // zip magic, truncated
    const result = await extractArtifact("bad.zip", corrupt);
    expect(result.failed).toBe(true);
  });
});
