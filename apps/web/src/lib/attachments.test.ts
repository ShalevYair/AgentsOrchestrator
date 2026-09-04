import { describe, expect, it } from "vitest";
import {
  buildAttachmentState,
  composeMessageWithAttachments,
  isEstimatableKind,
  MAX_ESTIMATABLE_BYTES,
  sumEstimatedTokens,
  type AttachmentState,
} from "./attachments.js";

function textFile(name: string, content: string, type = "text/plain"): File {
  return new File([content], name, { type });
}

describe("buildAttachmentState", () => {
  it("estimates real tokens for a text file using @ao/ingest's real estimateTokens", async () => {
    const file = textFile("notes.txt", "hello world, this is a plain english sentence for testing.");
    const state = await buildAttachmentState(file);
    expect(state.status).toBe("ready");
    expect(state.kind).toBe("text");
    expect(state.estimatedTokens).not.toBeNull();
    expect(state.estimatedTokens).toBeGreaterThan(0);
    expect(state.content).toContain("hello world");
  });

  it("uses the 'code' token ratio for a code file, not the generic mixed one", async () => {
    // Same text, different extension -> different (real) ratio -> different estimate.
    const text = "function add(a, b) { return a + b; }".repeat(20);
    const codeState = await buildAttachmentState(textFile("add.ts", text));
    const textState = await buildAttachmentState(textFile("add.txt", text));
    expect(codeState.estimatedTokens).not.toBe(textState.estimatedTokens);
  });

  it("classifies an image as unsupported — no fabricated token count", async () => {
    const file = new File([new Uint8Array([0, 1, 2, 3])], "photo.png", { type: "image/png" });
    const state = await buildAttachmentState(file);
    expect(state.status).toBe("unsupported");
    expect(state.estimatedTokens).toBeNull();
    expect(state.content).toBeNull();
  });

  it("classifies a zip archive as unsupported too", async () => {
    const file = new File([new Uint8Array([0, 1])], "bundle.zip", { type: "application/zip" });
    const state = await buildAttachmentState(file);
    expect(state.status).toBe("unsupported");
  });

  it("marks a file over MAX_ESTIMATABLE_BYTES as too-large without reading it", async () => {
    const bigContent = "x".repeat(MAX_ESTIMATABLE_BYTES + 1);
    const file = textFile("huge.txt", bigContent);
    const state = await buildAttachmentState(file);
    expect(state.status).toBe("too-large");
    expect(state.estimatedTokens).toBeNull();
    expect(state.content).toBeNull();
  });

  it("gives two different files (even same name) distinct ids", async () => {
    const a = await buildAttachmentState(textFile("a.txt", "one"));
    const b = await buildAttachmentState(textFile("a.txt", "two, a longer different string"));
    expect(a.id).not.toBe(b.id);
  });

  /** UX.md §10 "הקובץ ריק/פגום": an empty file is still real content (0 tokens), never null/NaN/a crash. */
  it("handles a genuinely empty (0-byte) file as ready with 0 tokens, not an error", async () => {
    const file = textFile("empty.txt", "");
    const state = await buildAttachmentState(file);
    expect(state.status).toBe("ready");
    expect(state.estimatedTokens).toBe(0);
    expect(state.content).toBe("");
  });

  /** UX.md §10 "הקובץ ריק/פגום": a file that fails to read (permission revoked, deleted on disk) resolves as `read-error` — it must never reject and take the whole `Promise.all` batch down with it (ChatInput.addFiles). */
  it("resolves as read-error (never rejects) when FileReader itself fails", async () => {
    // Saved only to be reassigned back onto the same prototype in `finally`
    // below, never invoked directly by this test — no `this` is lost.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalReadAsText = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function (this: FileReader): void {
      setTimeout(() => {
        this.dispatchEvent(new Event("error"));
      }, 0);
    };
    try {
      const file = textFile("corrupt.txt", "irrelevant — the read itself fails");
      const state = await buildAttachmentState(file);
      expect(state.status).toBe("read-error");
      expect(state.estimatedTokens).toBeNull();
      expect(state.content).toBeNull();
    } finally {
      FileReader.prototype.readAsText = originalReadAsText;
    }
  });
});

describe("isEstimatableKind", () => {
  it("is true for text-shaped kinds, false for binary ones", () => {
    expect(isEstimatableKind("code")).toBe(true);
    expect(isEstimatableKind("text")).toBe(true);
    expect(isEstimatableKind("markdown")).toBe(true);
    expect(isEstimatableKind("table")).toBe(true);
    expect(isEstimatableKind("image")).toBe(false);
    expect(isEstimatableKind("zip")).toBe(false);
  });
});

describe("sumEstimatedTokens", () => {
  it("sums only the real (non-null) estimates, treating unsupported files as 0", () => {
    const attachments = [
      { estimatedTokens: 100 } as AttachmentState,
      { estimatedTokens: null } as AttachmentState,
      { estimatedTokens: 50 } as AttachmentState,
    ];
    expect(sumEstimatedTokens(attachments)).toBe(150);
  });

  it("is 0 for an empty list", () => {
    expect(sumEstimatedTokens([])).toBe(0);
  });
});

describe("composeMessageWithAttachments", () => {
  it("returns the plain text unchanged with no attachments", () => {
    expect(composeMessageWithAttachments("hi", [], () => "")).toBe("hi");
  });

  it("appends one rendered section per attachment, in order", () => {
    const attachments = [{ id: "a" }, { id: "b" }] as AttachmentState[];
    const result = composeMessageWithAttachments("hi", attachments, (a) => `[${a.id}]`);
    expect(result).toBe("hi\n\n[a]\n\n[b]");
  });

  it("still includes attachment sections when the typed text is empty", () => {
    const attachments = [{ id: "a" }] as AttachmentState[];
    const result = composeMessageWithAttachments("", attachments, (a) => `[${a.id}]`);
    expect(result).toBe("[a]");
  });
});
