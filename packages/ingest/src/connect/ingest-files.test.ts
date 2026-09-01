import { describe, expect, it } from "vitest";
import { ingestFiles, type IngestFileInput } from "./ingest-files.js";
import {
  makeTestDocx,
  makeTestPdf,
  makeTestPng,
  makeTestPptx,
  makeTestZip,
} from "../extract/test-fixtures.js";

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("ingestFiles", () => {
  it("returns empty result for an empty batch", async () => {
    const result = await ingestFiles([]);
    expect(result.artifacts).toEqual([]);
    expect(result.gaps).toEqual([]);
  });

  it("extracts and chunks a valid text file", async () => {
    const result = await ingestFiles([{ path: "a.ts", data: text("export const x = 1;\n") }]);
    expect(result.gaps).toEqual([]);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.chunks.length).toBeGreaterThan(0);
    expect(result.artifacts[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ingests 50 mixed files and a corrupt one doesn't crash the batch (P3-T1 done criterion)", async () => {
    const inputs: IngestFileInput[] = [];
    for (let i = 0; i < 20; i++) {
      inputs.push({
        path: `code/file${String(i)}.ts`,
        data: text(`export const v${String(i)} = ${String(i)};`),
      });
    }
    for (let i = 0; i < 10; i++) {
      inputs.push({ path: `docs/note${String(i)}.md`, data: text(`# Note ${String(i)}\n\nSome text.`) });
    }
    for (let i = 0; i < 5; i++) {
      inputs.push({ path: `p${String(i)}.pdf`, data: makeTestPdf(`Doc ${String(i)}`) });
    }
    for (let i = 0; i < 5; i++) {
      inputs.push({ path: `d${String(i)}.docx`, data: makeTestDocx(`Docx ${String(i)}`) });
    }
    for (let i = 0; i < 3; i++) {
      inputs.push({ path: `s${String(i)}.pptx`, data: makeTestPptx([`Slide ${String(i)}`]) });
    }
    for (let i = 0; i < 3; i++) {
      inputs.push({ path: `img${String(i)}.png`, data: makeTestPng(4, 4) });
    }
    // Corrupt files mixed in, by extension, that will genuinely fail to parse.
    inputs.push({ path: "broken1.pdf", data: text("not a pdf") });
    inputs.push({ path: "broken2.docx", data: text("not a docx (not even a zip)") });
    inputs.push({ path: "broken3.zip", data: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]) });
    inputs.push({ path: "broken4.docx", data: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9]) });

    expect(inputs.length).toBe(50);

    const result = await ingestFiles(inputs);

    expect(result.artifacts.length + result.gaps.length).toBeGreaterThanOrEqual(50);
    expect(result.gaps.length).toBeGreaterThanOrEqual(3);
    expect(result.gaps.map((g) => g.path)).toEqual(expect.arrayContaining(["broken1.pdf", "broken2.docx"]));
    // The 46 good files (excluding the corrupt ones, before archive
    // recursion, none here) all made it through despite the corrupt ones.
    expect(result.artifacts.length).toBeGreaterThanOrEqual(46);
  });

  it("recursively ingests archive entries", async () => {
    const zip = makeTestZip({
      "inner.ts": "export const nested = true;",
      "notes.md": "# Nested doc",
    });
    const result = await ingestFiles([{ path: "bundle.zip", data: zip }]);
    expect(result.gaps).toEqual([]);
    const paths = result.artifacts.map((a) => a.path).sort();
    expect(paths).toEqual(["bundle.zip", "bundle.zip/inner.ts", "bundle.zip/notes.md"]);
  });

  it("reports progress incrementally across the batch", async () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      path: `f${String(i)}.ts`,
      data: text(`const x${String(i)} = ${String(i)};`),
    }));
    const seen: number[] = [];
    await ingestFiles(inputs, { onProgress: (p) => seen.push(p.filesProcessed) });
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("cancels via AbortSignal without processing further files", async () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      path: `f${String(i)}.ts`,
      data: text(`const x${String(i)} = ${String(i)};`),
    }));
    const controller = new AbortController();
    let processed = 0;
    await expect(
      ingestFiles(inputs, {
        onProgress: (p) => {
          processed = p.filesProcessed;
          if (processed === 3) controller.abort();
        },
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i);
    expect(processed).toBe(3);
  });
});
