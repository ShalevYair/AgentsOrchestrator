export { hashBuffer, hashFile } from "./hash/sha256.js";
export { DerivativeCache } from "./cache/derivative-cache.js";
export { estimateTokens, type TokenKind } from "./tokens/estimate-tokens.js";
export { extractArtifact, detectKind, unpackArchive } from "./extract/extract.js";
export type { ExtractedText, ExtractorKind } from "./extract/types.js";
export { chunkText } from "./chunk/chunk.js";
export type { Chunk, ChunkLoc, ChunkOptions } from "./chunk/chunk.js";
export { DEFAULT_IGNORE_PATTERNS } from "./ignore/ignore-rules.js";
export { connectFolder } from "./connect/connect-folder.js";
export type {
  ConnectedFile,
  ConnectFolderOptions,
  ConnectFolderProgress,
  ConnectFolderResult,
  FolderTreeNode,
} from "./connect/connect-folder.js";
export { ingestFiles } from "./connect/ingest-files.js";
export type {
  IngestedArtifact,
  IngestFileInput,
  IngestFilesOptions,
  IngestFilesProgress,
  IngestFilesResult,
  IngestGap,
} from "./connect/ingest-files.js";
