import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import he from "../../i18n/locales/he.json";
import "../../i18n/index.js";
import { downloadBlob } from "../../lib/download.js";
import { ArtifactCard } from "./ArtifactCard.js";

vi.mock("shiki", () => ({
  codeToHtml: (code: string) => Promise.resolve(`<pre><code>${code}</code></pre>`),
}));
vi.mock("../../lib/download.js", () => ({ downloadBlob: vi.fn() }));

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("ArtifactCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a code artifact via CodeBlock, with the path as its label", () => {
    render(<ArtifactCard name="index.ts" path="src/index.ts" data={bytes("const x = 1;")} />);
    expect(screen.getAllByText("src/index.ts").length).toBeGreaterThan(0);
    expect(screen.getByText(/const x = 1/)).toBeInTheDocument();
  });

  it("renders a Markdown artifact through the Markdown component", () => {
    render(<ArtifactCard name="README.md" path="README.md" data={bytes("# Hello")} />);
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
  });

  it("renders an image artifact as an <img>", () => {
    render(<ArtifactCard name="logo.png" path="assets/logo.png" data={bytes("fake-png-bytes")} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("renders a table artifact (.csv) as a real HTML table", () => {
    render(<ArtifactCard name="data.csv" path="data.csv" data={bytes("name,count\na,1")} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
  });

  it("renders a zip artifact by listing its entries", () => {
    render(<ArtifactCard name="bundle.zip" path="bundle.zip" data={bytes("not-a-real-zip")} />);
    // corrupt bytes -> zero entries, but the viewer itself must still render without throwing
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("downloads the exact bytes under the artifact's display name on click", async () => {
    const user = userEvent.setup();
    const data = bytes("fake-png-bytes"); // image kind — no extra viewer buttons to disambiguate from
    render(<ArtifactCard name="logo.png" path="assets/logo.png" data={data} />);

    await user.click(screen.getByLabelText(he.artifacts.download));

    expect(downloadBlob).toHaveBeenCalledWith("logo.png", data, expect.any(String));
  });

  it("shows no diff/write-to-folder controls when neither is supplied — only the header download button", () => {
    render(<ArtifactCard name="logo.png" path="assets/logo.png" data={bytes("x")} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("toggling the diff button reveals and hides the DiffViewer", async () => {
    const user = userEvent.setup();
    render(<ArtifactCard name="logo.png" path="assets/logo.png" data={bytes("x")} diffText={" a\n+b"} />);

    expect(screen.queryByText("b")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: he.artifacts.showDiff }));
    expect(screen.getByText("b")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: he.artifacts.hideDiff }));
    expect(screen.queryByText("b")).not.toBeInTheDocument();
  });

  it("shows a write-to-folder button only when onWriteToFolder is supplied, and calls it on click", async () => {
    const user = userEvent.setup();
    const onWriteToFolder = vi.fn();
    render(
      <ArtifactCard
        name="logo.png"
        path="assets/logo.png"
        data={bytes("x")}
        onWriteToFolder={onWriteToFolder}
      />,
    );

    await user.click(screen.getByRole("button", { name: he.artifacts.writeToFolder }));
    expect(onWriteToFolder).toHaveBeenCalledTimes(1);
  });
});
