import type { BinaryStructure, ExtractedText } from "./types.js";

const SIGNATURES: { type: string; bytes: number[] }[] = [
  { type: "elf", bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { type: "pe", bytes: [0x4d, 0x5a] },
  { type: "gzip", bytes: [0x1f, 0x8b] },
  { type: "wasm", bytes: [0x00, 0x61, 0x73, 0x6d] },
  { type: "sqlite", bytes: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65] },
];

/** Unknown/unrecognized binary: recorded (hash + size are computed by the
 * caller from the raw bytes) with a best-effort type guess, nothing more —
 * per ARCHITECTURE.md §5.1 this bucket is never sent anywhere. */
export function extractBinary(data: Uint8Array): ExtractedText {
  const detectedType = SIGNATURES.find((sig) => startsWith(data, sig.bytes))?.type;
  const structure: BinaryStructure = { detectedType };
  return { kind: "binary", text: "", structure, warnings: [], failed: false };
}

function startsWith(data: Uint8Array, prefix: number[]): boolean {
  if (data.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (data[i] !== prefix[i]) return false;
  }
  return true;
}
