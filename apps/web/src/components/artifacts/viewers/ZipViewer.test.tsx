import { zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../../i18n/index.js";
import { downloadBlob } from "../../../lib/download.js";
import { ZipViewer } from "./ZipViewer.js";

vi.mock("../../../lib/download.js", () => ({ downloadBlob: vi.fn() }));

describe("ZipViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists every real entry in a real zip archive, with its size", () => {
    const zipped = zipSync({
      "a.txt": new TextEncoder().encode("hello"),
      "sub/b.txt": new TextEncoder().encode("longer content here"),
    });

    render(<ZipViewer data={zipped} filename="bundle.zip" />);

    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("sub/b.txt")).toBeInTheDocument();
    expect(screen.getByText("5 B")).toBeInTheDocument(); // "hello".length
  });

  it("does not crash on corrupt zip bytes — shows zero entries instead", () => {
    render(<ZipViewer data={new Uint8Array([1, 2, 3])} filename="bad.zip" />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("downloads the exact original archive bytes, unmodified", async () => {
    const zipped = zipSync({ "a.txt": new TextEncoder().encode("hello") });
    const user = userEvent.setup();
    render(<ZipViewer data={zipped} filename="bundle.zip" />);

    await user.click(screen.getByRole("button"));

    expect(downloadBlob).toHaveBeenCalledWith("bundle.zip", zipped, "application/zip");
  });
});
