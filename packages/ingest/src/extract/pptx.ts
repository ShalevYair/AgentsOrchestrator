import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { PptxStructure, ExtractedText } from "./types.js";

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;

/** PPTX is a zip of XML parts (like DOCX/XLSX) but there is no mature,
 * dependency-light "mammoth for PowerPoint". We unzip it ourselves and pull
 * text runs (`<a:t>`) out of each slide's XML — enough for the ingest
 * ladder's purposes (structure + text), without a heavy rendering engine. */
export function extractPptx(data: Uint8Array): ExtractedText {
  const entries = unzipSync(data);
  const parser = new XMLParser({ ignoreAttributes: true, textNodeName: "#text" });

  const slideFiles = Object.keys(entries)
    .map((path) => {
      const match = SLIDE_PATH.exec(path);
      return match ? { path, index: Number(match[1]) } : undefined;
    })
    .filter((x): x is { path: string; index: number } => x !== undefined)
    .sort((a, b) => a.index - b.index);

  const slideTexts = slideFiles.map(({ path }) => {
    const xml = strFromU8(entries[path] as Uint8Array);
    const runs: string[] = [];
    collectTextRuns(parser.parse(xml) as unknown, runs);
    return runs.join(" ");
  });

  const structure: PptxStructure = { slideCount: slideFiles.length };
  const text = slideTexts.map((t, i) => `--- slide ${String(i + 1)} ---\n${t}`).join("\n\n");

  return { kind: "pptx", text, structure, warnings: [], failed: false };
}

/** Recursively walks the parsed slide XML looking for `a:t` text-run keys
 * (fast-xml-parser flattens namespaced tags to their literal key, e.g.
 * "a:t"). Collects both string and { "#text": string } shapes. */
function collectTextRuns(node: unknown, out: string[]): void {
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "a:t") {
      if (typeof value === "string") out.push(value);
      else if (isTextNode(value)) out.push(value["#text"]);
    } else if (Array.isArray(value)) {
      for (const item of value) collectTextRuns(item, out);
    } else if (typeof value === "object") {
      collectTextRuns(value, out);
    }
  }
}

function isTextNode(value: unknown): value is { "#text": string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "#text" in value &&
    typeof (value as Record<string, unknown>)["#text"] === "string"
  );
}
