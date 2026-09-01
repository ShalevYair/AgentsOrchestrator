import type { CodeStructure, ExtractedText } from "./types.js";

const BOM = "﻿";

/** Plain-text decode for source/config/markup files. Symbol maps and
 * dependency graphs are RepoMap's job (P3-T5) — this stage only turns
 * bytes into text. */
export function extractCode(data: Uint8Array): ExtractedText {
  let text = new TextDecoder("utf-8", { fatal: false }).decode(data);
  if (text.startsWith(BOM)) text = text.slice(1);

  const structure: CodeStructure = { lineCount: text.length === 0 ? 0 : text.split("\n").length };

  return { kind: "code", text, structure, warnings: [], failed: false };
}
