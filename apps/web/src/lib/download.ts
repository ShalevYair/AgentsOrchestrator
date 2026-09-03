import { zipSync, type Zippable } from "fflate";

/** P8-T8 — "הורדה בודדת": Blob + a throwaway `<a download>` click, the standard browser download idiom. The object URL is revoked right after the click so it doesn't leak. `Uint8Array` is accepted alongside `BlobPart` explicitly — TS's stricter typed-array generics (`Uint8Array<ArrayBufferLike>` vs. `BlobPart`'s `ArrayBufferView<ArrayBuffer>`) reject a plain `Uint8Array` even though `Blob`'s real runtime constructor has always accepted one. */
export function downloadBlob(filename: string, data: BlobPart | Uint8Array, mimeType: string): void {
  const blob = new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export interface DownloadableFile {
  /** Path inside the zip — matches the artifact's own relative path so a batch download reproduces the same layout the agent produced. */
  path: string;
  data: Uint8Array;
}

/** P8-T8 — "הורדת הכל כ-ZIP": zips client-side with `fflate` (already a dependency elsewhere in this monorepo, `packages/ingest`) rather than round-tripping through the server for a bundle the browser already has every byte of. */
export function downloadFilesAsZip(zipFilename: string, files: readonly DownloadableFile[]): void {
  const entries: Zippable = {};
  for (const file of files) entries[file.path] = file.data;
  const zipped = zipSync(entries);
  downloadBlob(zipFilename, zipped, "application/zip");
}
