import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import he from "../../i18n/locales/he.json";
import "../../i18n/index.js";
import { ArtifactGroup, type ArtifactGroupItem } from "./ArtifactGroup.js";

vi.mock("shiki", () => ({
  codeToHtml: (code: string) => Promise.resolve(`<pre><code>${code}</code></pre>`),
}));

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// image kind — no viewer-internal buttons (CodeBlock's Copy button would
// otherwise make raw button counts ambiguous), so counts below stay exact.
const ITEMS: ArtifactGroupItem[] = [
  { id: "1", name: "a.png", path: "assets/a.png", data: bytes("fake-a") },
  { id: "2", name: "b.png", path: "assets/b.png", data: bytes("fake-b") },
];

describe("ArtifactGroup", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("renders one card per artifact", () => {
    render(<ArtifactGroup artifacts={ITEMS} zipFilename="bundle.zip" />);
    expect(screen.getAllByText("assets/a.png").length).toBeGreaterThan(0);
    expect(screen.getAllByText("assets/b.png").length).toBeGreaterThan(0);
  });

  it("hides the download-all button for a single artifact", () => {
    render(<ArtifactGroup artifacts={[ITEMS[0]!]} zipFilename="bundle.zip" />);
    expect(screen.queryByRole("button", { name: he.artifacts.downloadAll })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1); // just that card's own download button
  });

  it("shows the download-all button for more than one artifact", () => {
    render(<ArtifactGroup artifacts={ITEMS} zipFilename="bundle.zip" />);
    expect(screen.getByRole("button", { name: he.artifacts.downloadAll })).toBeInTheDocument();
  });

  it("download-all produces a real zip containing every artifact's exact bytes at its own path", async () => {
    let capturedParts: BlobPart[] | undefined;
    const RealBlob = globalThis.Blob;
    class CapturingBlob extends RealBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        capturedParts = parts;
      }
    }
    vi.stubGlobal("Blob", CapturingBlob);

    const user = userEvent.setup();
    render(<ArtifactGroup artifacts={ITEMS} zipFilename="bundle.zip" />);
    await user.click(screen.getByRole("button", { name: he.artifacts.downloadAll }));

    const zippedBytes = capturedParts![0] as Uint8Array;
    const unzipped = unzipSync(zippedBytes);
    expect(new TextDecoder().decode(unzipped["assets/a.png"])).toBe("fake-a");
    expect(new TextDecoder().decode(unzipped["assets/b.png"])).toBe("fake-b");

    vi.unstubAllGlobals();
  });

  it("only renders write-to-folder for artifacts marked writable, and routes the click to the right artifact", async () => {
    const user = userEvent.setup();
    const onWriteToFolder = vi.fn();
    const items: ArtifactGroupItem[] = [
      { ...ITEMS[0]!, writable: true },
      { ...ITEMS[1]!, writable: false },
    ];
    render(<ArtifactGroup artifacts={items} zipFilename="bundle.zip" onWriteToFolder={onWriteToFolder} />);

    const writeButtons = screen.getAllByRole("button", { name: he.artifacts.writeToFolder });
    expect(writeButtons).toHaveLength(1);
    await user.click(writeButtons[0]!);
    expect(onWriteToFolder).toHaveBeenCalledWith(items[0]);
  });
});
