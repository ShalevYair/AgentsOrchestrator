import { unzipSync } from "fflate";
import type { ArchiveEntry, ArchiveStructure, ExtractedText } from "./types.js";

/** Unpacks a zip archive's entries. Directory entries (trailing "/") are
 * dropped. Filtering (.gitignore/.aoignore, size caps) and recursively
 * running the extraction ladder on each entry is the caller's job
 * (connect-folder / ingest-files) — this stage only unpacks. */
export function unpackArchive(data: Uint8Array): ArchiveEntry[] {
  const unzipped = unzipSync(data);
  const entries: ArchiveEntry[] = [];
  for (const [path, bytes] of Object.entries(unzipped)) {
    if (path.endsWith("/")) continue;
    entries.push({ path, sizeBytes: bytes.byteLength, data: bytes });
  }
  return entries;
}

export function extractArchive(data: Uint8Array): ExtractedText {
  const entries = unpackArchive(data);
  const structure: ArchiveStructure = {
    entryCount: entries.length,
    entries: entries.map((e) => ({ path: e.path, sizeBytes: e.sizeBytes })),
  };
  const text = structure.entries.map((e) => `${e.path} (${String(e.sizeBytes)} bytes)`).join("\n");

  return { kind: "archive", text, structure, warnings: [], failed: false };
}
