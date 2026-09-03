import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../i18n/index.js";
import { DegradationToasts } from "./DegradationToasts.js";

describe("DegradationToasts (BUDGET.md §8 — non-blocking toasts)", () => {
  it("renders nothing with no toasts", () => {
    const { container } = render(<DegradationToasts toasts={[]} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the plain-degradation message with the real amount", () => {
    render(<DegradationToasts toasts={[{ id: "d1", amount: 12_000, clamped: false }]} onDismiss={vi.fn()} />);
    expect(screen.getByText(/12K/)).toBeInTheDocument();
    expect(screen.queryByText(/כמעט ריקה/)).not.toBeInTheDocument();
  });

  it("shows the clamped-specific message when the reserve itself was insufficient", () => {
    render(<DegradationToasts toasts={[{ id: "d1", amount: 5_000, clamped: true }]} onDismiss={vi.fn()} />);
    expect(screen.getByText(/כמעט ריקה/)).toBeInTheDocument();
  });

  it("renders multiple simultaneous toasts, each independently", () => {
    render(
      <DegradationToasts
        toasts={[
          { id: "d1", amount: 1_000, clamped: false },
          { id: "d2", amount: 2_000, clamped: true },
        ]}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/1K/)).toBeInTheDocument();
    expect(screen.getByText(/2K/)).toBeInTheDocument();
  });

  it("clicking dismiss calls onDismiss with that toast's id, not the others", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <DegradationToasts
        toasts={[
          { id: "d1", amount: 1_000, clamped: false },
          { id: "d2", amount: 2_000, clamped: false },
        ]}
        onDismiss={onDismiss}
      />,
    );
    const dismissButtons = screen.getAllByRole("button", { name: "סגור התראה" });
    expect(dismissButtons).toHaveLength(2);
    await user.click(dismissButtons[0]!);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("d1");
  });

  describe("auto-dismiss", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("auto-dismisses a toast after the timeout", () => {
      const onDismiss = vi.fn();
      render(
        <DegradationToasts toasts={[{ id: "d1", amount: 1_000, clamped: false }]} onDismiss={onDismiss} />,
      );
      expect(onDismiss).not.toHaveBeenCalled();
      vi.advanceTimersByTime(6000);
      expect(onDismiss).toHaveBeenCalledExactlyOnceWith("d1");
    });

    it("does not fire before the timeout", () => {
      const onDismiss = vi.fn();
      render(
        <DegradationToasts toasts={[{ id: "d1", amount: 1_000, clamped: false }]} onDismiss={onDismiss} />,
      );
      vi.advanceTimersByTime(3000);
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });
});
