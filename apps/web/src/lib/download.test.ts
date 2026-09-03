import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob, downloadFilesAsZip } from "./download.js";

// jsdom doesn't implement the Blob object-URL APIs — stub them so
// downloadBlob's real code path (Blob -> object URL -> anchor click ->
// revoke) runs for real, just without an actual browser download.
describe("downloadBlob", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let createObjectUrlSpy: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>;
  let revokeObjectUrlSpy: ReturnType<typeof vi.fn<(url: string) => void>>;

  beforeEach(() => {
    createObjectUrlSpy = vi.fn(() => "blob:mock-url");
    revokeObjectUrlSpy = vi.fn();
    URL.createObjectURL = createObjectUrlSpy;
    URL.revokeObjectURL = revokeObjectUrlSpy;
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an object URL, clicks a download anchor with the right filename, then revokes the URL", () => {
    downloadBlob("report.csv", "a,b\n1,2", "text/csv");

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("leaves no anchor element behind in the document", () => {
    downloadBlob("report.csv", "a,b\n1,2", "text/csv");
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("accepts a Uint8Array directly (not just string/BlobPart)", () => {
    expect(() =>
      downloadBlob("data.bin", new Uint8Array([1, 2, 3]), "application/octet-stream"),
    ).not.toThrow();
  });
});

describe("downloadFilesAsZip", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock-zip-url");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces a real zip whose entries match the input files byte-for-byte", () => {
    let capturedParts: BlobPart[] | undefined;
    const RealBlob = globalThis.Blob;
    class CapturingBlob extends RealBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        capturedParts = parts;
      }
    }
    vi.stubGlobal("Blob", CapturingBlob);

    downloadFilesAsZip("bundle.zip", [
      { path: "a.txt", data: new TextEncoder().encode("hello") },
      { path: "sub/b.txt", data: new TextEncoder().encode("world") },
    ]);

    expect(capturedParts).toBeDefined();
    const zippedBytes = capturedParts![0] as Uint8Array;
    const unzipped = unzipSync(zippedBytes);
    expect(new TextDecoder().decode(unzipped["a.txt"])).toBe("hello");
    expect(new TextDecoder().decode(unzipped["sub/b.txt"])).toBe("world");
  });
});
