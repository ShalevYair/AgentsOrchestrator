import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../i18n/index.js";
import { TokenCounter } from "./TokenCounter.js";

describe("TokenCounter (P2-T8)", () => {
  it("renders the given token count", () => {
    render(<TokenCounter tokens={1234} />);
    expect(screen.getByText(/1234/)).toBeInTheDocument();
  });

  it("has aria-live so a screen reader announces updates as the count changes", () => {
    const { container } = render(<TokenCounter tokens={0} />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
