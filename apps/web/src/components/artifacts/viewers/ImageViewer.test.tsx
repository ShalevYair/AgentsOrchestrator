import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../../i18n/index.js";
import { ImageViewer } from "./ImageViewer.js";

describe("ImageViewer", () => {
  it("renders an img with the given src and a name-derived alt text", () => {
    render(<ImageViewer src="data:image/png;base64,AAAA" name="logo.png" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(img.getAttribute("alt")).toContain("logo.png");
  });
});
