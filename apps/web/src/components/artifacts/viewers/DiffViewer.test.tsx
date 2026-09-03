import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiffViewer } from "./DiffViewer.js";

describe("DiffViewer", () => {
  it("renders context, added, and removed lines with their own text visible", () => {
    render(<DiffViewer diffText={" a\n-b\n+X\n c"} />);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getByText("c")).toBeInTheDocument();
  });

  it("renders no line rows for empty diff text", () => {
    const { container } = render(<DiffViewer diffText="" />);
    expect(container.querySelectorAll(".whitespace-pre")).toHaveLength(0);
  });

  it("is an LTR container regardless of surrounding direction (diff content is source text)", () => {
    const { container } = render(<DiffViewer diffText=" a" />);
    expect(container.firstChild).toHaveAttribute("dir", "ltr");
  });
});
