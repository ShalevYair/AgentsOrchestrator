import { chunkText, type Chunk, type ChunkOptions } from "../chunk/chunk.js";
import { extractArtifact, unpackArchive } from "../extract/extract.js";
import type { ExtractedText } from "../extract/types.js";
import { hashBuffer } from "../hash/sha256.js";

export interface IngestFileInput {
  /** Display/relative path — from a File's `name`/`webkitRelativePath`, a
   * drag-drop item, or a pasted attachment's filename. */
  path: string;
  data: Uint8Array;
}

export interface IngestedArtifact {
  artifactId: string;
  path: string;
  sizeBytes: number;
  sha256: string;
  extracted: ExtractedText;
  chunks: Chunk[];
}

export interface IngestGap {
  path: string;
  reason: string;
}

export interface IngestFilesProgress {
  filesProcessed: number;
  totalFiles: number;
  bytesExtracted: number;
}

export interface IngestFilesOptions {
  chunkOptions?: ChunkOptions;
  onProgress?: (progress: IngestFilesProgress) => void;
  signal?: AbortSignal;
}

export interface IngestFilesResult {
  artifacts: IngestedArtifact[];
  gaps: IngestGap[];
  totalBytes: number;
}

const MAX_ARCHIVE_DEPTH = 5;

/**
 * Batch-ingests files the caller already read into memory — this is the
 * library side of "multi, drag, paste" (P3-T1): the UI's job is turning a
 * drop/paste/file-picker event into `IngestFileInput[]`, this turns that
 * into extracted+chunked artifacts. One corrupt file never aborts the rest
 * of the batch — its extraction failure becomes a `gaps` entry instead
 * (mirrors P3-T3's per-file failure handling, one level up).
 */
export async function ingestFiles(
  inputs: IngestFileInput[],
  options: IngestFilesOptions = {},
  depth = 0,
): Promise<IngestFilesResult> {
  const artifacts: IngestedArtifact[] = [];
  const gaps: IngestGap[] = [];
  let totalBytes = 0;
  let filesProcessed = 0;

  for (const input of inputs) {
    throwIfAborted(options.signal);

    try {
      const sha256 = hashBuffer(input.data);
      const extracted = await extractArtifact(input.path, input.data);

      if (extracted.failed) {
        gaps.push({ path: input.path, reason: extracted.warnings.join("; ") || "extraction failed" });
      } else {
        const chunks = extracted.text ? chunkText(sha256, extracted.text, options.chunkOptions) : [];
        artifacts.push({
          artifactId: sha256,
          path: input.path,
          sizeBytes: input.data.byteLength,
          sha256,
          extracted,
          chunks,
        });

        if (extracted.kind === "archive") {
          const nested = await ingestArchive(input, options, depth);
          artifacts.push(...nested.artifacts);
          gaps.push(...nested.gaps);
          totalBytes += nested.totalBytes;
        }
      }
    } catch (err) {
      // extractArtifact itself never throws, but this guards against a bug
      // in a future extractor so one bad file still can't take the batch
      // down (P3-T1 done criterion).
      gaps.push({ path: input.path, reason: errorMessage(err) });
    }

    filesProcessed++;
    totalBytes += input.data.byteLength;
    options.onProgress?.({ filesProcessed, totalFiles: inputs.length, bytesExtracted: totalBytes });
  }

  return { artifacts, gaps, totalBytes };
}

async function ingestArchive(
  input: IngestFileInput,
  options: IngestFilesOptions,
  depth: number,
): Promise<IngestFilesResult> {
  if (depth >= MAX_ARCHIVE_DEPTH) {
    return {
      artifacts: [],
      gaps: [
        {
          path: input.path,
          reason: `archive nesting exceeded ${String(MAX_ARCHIVE_DEPTH)} levels, not unpacked further`,
        },
      ],
      totalBytes: 0,
    };
  }

  try {
    const entries = unpackArchive(input.data);
    const nestedInputs = entries.map((entry) => ({
      path: `${input.path}/${entry.path}`,
      data: entry.data,
    }));
    // Archive entries don't get their own top-level progress ticks — the
    // archive itself already counted as one file in the parent loop.
    const nestedOptions: IngestFilesOptions = {};
    if (options.chunkOptions) nestedOptions.chunkOptions = options.chunkOptions;
    if (options.signal) nestedOptions.signal = options.signal;
    return await ingestFiles(nestedInputs, nestedOptions, depth + 1);
  } catch (err) {
    return { artifacts: [], gaps: [{ path: input.path, reason: errorMessage(err) }], totalBytes: 0 };
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("ingestFiles aborted", "AbortError");
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
