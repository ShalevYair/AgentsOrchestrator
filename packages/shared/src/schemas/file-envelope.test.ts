import { describe, expect, it } from "vitest";
import { FileEnvelopeSchema, type FileEnvelope } from "./file-envelope.js";

/** Verbatim from PROTOCOLS.md §4. */
const EXAMPLE_FILE_ENVELOPE: FileEnvelope = {
  path: "src/auth/guard.ts",
  op: "create",
  encoding: "utf8",
  sha256: "b".repeat(64),
  sizeBytes: 4210,
  producedBy: { stageId: "s3", taskId: "s3#2" },
  renameFrom: null,
};

describe("FileEnvelopeSchema", () => {
  it("parses the example from PROTOCOLS.md §4 verbatim", () => {
    const env = FileEnvelopeSchema.parse(EXAMPLE_FILE_ENVELOPE);
    expect(env.producedBy.taskId).toBe("s3#2");
    expect(env.renameFrom).toBeNull();
  });

  it("rejects an op outside create/update/delete/rename", () => {
    expect(() => FileEnvelopeSchema.parse({ ...EXAMPLE_FILE_ENVELOPE, op: "truncate" })).toThrow();
  });

  it("rejects a non-hex sha256", () => {
    expect(() => FileEnvelopeSchema.parse({ ...EXAMPLE_FILE_ENVELOPE, sha256: "ZZZZ" })).toThrow();
  });
});
