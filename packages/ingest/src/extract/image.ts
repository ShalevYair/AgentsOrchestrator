import { imageSize } from "image-size";
import type { ImageStructure, ExtractedText } from "./types.js";

/** Per ARCHITECTURE.md §5.1: metadata only. The image itself is sent to a
 * model only if the planner explicitly asks for it — that's a P5+ concern,
 * not this stage's. */
export function extractImage(data: Uint8Array): ExtractedText {
  let structure: ImageStructure = { width: undefined, height: undefined, format: undefined };
  const warnings: string[] = [];
  try {
    const info = imageSize(data);
    structure = { width: info.width, height: info.height, format: info.type };
  } catch (err) {
    warnings.push(`could not read image dimensions: ${errorMessage(err)}`);
  }

  return { kind: "image", text: "", structure, warnings, failed: false };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
