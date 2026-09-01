import { zipSync, strToU8 } from "fflate";

/** Hand-built minimal fixtures for each extractor, generated in-memory so
 * the test corpus doesn't need committed binary files. Each one is the
 * smallest input the real library (pdfjs-dist / mammoth / our own
 * pptx/zip readers / image-size) will accept as valid. */

export function makeTestPdf(text = "Hello PDF Ingest Test"): Uint8Array {
  const stream = `BT /F1 24 Tf 10 100 Td (${text}) Tj ET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 300 300] /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefStart)}\n%%EOF`;
  return Uint8Array.from(Buffer.from(pdf, "latin1"));
}

export function makeTestDocx(text = "Hello DOCX Ingest Test"): Uint8Array {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`;

  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rels),
    "word/document.xml": strToU8(document),
  });
}

export function makeTestPptx(slideTexts: string[] = ["Hello PPTX Slide"]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  slideTexts.forEach((text, i) => {
    const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
    files[`ppt/slides/slide${String(i + 1)}.xml`] = strToU8(slide);
  });
  return zipSync(files);
}

export function makeTestZip(entries: Record<string, string>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(entries)) files[path] = strToU8(content);
  return zipSync(files);
}

export function makeTestPng(width = 16, height = 9): Uint8Array {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])]);
  const ihdr = Buffer.concat([u32(ihdrData.length), Buffer.from("IHDR"), ihdrData, u32(0)]);
  return Uint8Array.from(Buffer.concat([sig, ihdr]));
}

function u32(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n);
  return buf;
}
