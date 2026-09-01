import * as mammoth from "mammoth";
import type { DocxStructure, ExtractedText } from "./types.js";

export async function extractDocx(data: Uint8Array): Promise<ExtractedText> {
  const buffer = Buffer.from(data);
  const result = await mammoth.extractRawText({ buffer });
  const warnings = result.messages
    .filter((m) => m.type === "warning" || m.type === "error")
    .map((m) => m.message);

  const structure: DocxStructure = { warnings };
  return { kind: "docx", text: result.value, structure, warnings, failed: false };
}
