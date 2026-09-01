import type { PdfStructure, ExtractedText } from "./types.js";

interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
}

export async function extractPdf(data: Uint8Array): Promise<ExtractedText> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;

  const pages: string[] = [];
  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const items = content.items as PdfTextItem[];
      const pageText = items.map((item) => item.str).join(" ");
      pages.push(`--- page ${String(pageNum)} ---\n${pageText}`);
    }
  } finally {
    await doc.destroy();
  }

  const structure: PdfStructure = { pageCount: doc.numPages };
  return { kind: "pdf", text: pages.join("\n\n"), structure, warnings: [], failed: false };
}
