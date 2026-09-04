import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import type { GoalConfig } from "@ao/shared";
import "../../i18n/index.js";
import { GoalForm } from "./GoalForm.js";

/** Renders with a stateful wrapper so interacting with the form behaves like it does in the real GoalButton (each onChange feeds back in as the next `value`). */
function renderStateful(initial: GoalConfig = DEFAULT_GOAL_CONFIG) {
  const onChange = vi.fn();
  let current = initial;
  const { rerender } = render(<GoalForm value={current} onChange={onChange} />);
  const set = (next: GoalConfig): void => {
    current = next;
    rerender(<GoalForm value={current} onChange={onChange} />);
  };
  onChange.mockImplementation(set);
  return { onChange, getCurrent: () => current };
}

describe("GoalForm (UX.md §3)", () => {
  it("starts on the standard level with its derived budget/maxParallel", () => {
    renderStateful();
    expect(screen.getByRole("radio", { name: /סטנדרט/ })).toBeChecked();
  });

  it("selecting 'deep' updates budgetTotal and maxParallel to its derived values", async () => {
    const user = userEvent.setup();
    const { getCurrent } = renderStateful();
    await user.click(screen.getByRole("radio", { name: /עומק/ }));
    expect(getCurrent()).toMatchObject({ level: "deep", budgetTotal: 5_000_000, maxParallel: 12 });
  });

  it("selecting 'draft' updates budgetTotal/maxParallel and blocks ensemble per BUDGET.md §1", async () => {
    const user = userEvent.setup();
    const { getCurrent } = renderStateful();
    await user.click(screen.getByRole("radio", { name: /טיוטה/ }));
    expect(getCurrent()).toMatchObject({ level: "draft", budgetTotal: 500_000, maxParallel: 3 });
    expect(screen.getByText(/ensemble\/debate חסומים/)).toBeInTheDocument();
  });

  it("typing a custom budget switches the level to custom and stores the typed number", async () => {
    const user = userEvent.setup();
    const { getCurrent } = renderStateful();
    const customInput = screen.getByLabelText("תקציב מותאם אישית (טוקנים)");
    await user.clear(customInput);
    await user.type(customInput, "777000");
    expect(getCurrent().level).toBe("custom");
    expect(getCurrent().budgetTotal).toBe(777_000);
  });

  it("changing effort updates the value", async () => {
    const user = userEvent.setup();
    const { getCurrent } = renderStateful();
    await user.click(screen.getByRole("radio", { name: "יסודי" }));
    expect(getCurrent().effort).toBe("high");
  });

  it("changing the overrun policy updates the value", async () => {
    const user = userEvent.setup();
    const { getCurrent } = renderStateful();
    await user.click(screen.getByRole("radio", { name: "שאל אותי" }));
    expect(getCurrent().overrunPolicy).toBe("ask");
  });

  it("advanced: editing max parallel updates the value", async () => {
    const user = userEvent.setup();
    const { getCurrent } = renderStateful();
    await user.click(screen.getByText("מתקדם"));
    const maxParallelInput = screen.getByLabelText("מקס' סוכנים במקביל");
    await user.clear(maxParallelInput);
    await user.type(maxParallelInput, "9");
    expect(getCurrent().maxParallel).toBe(9);
  });

  it("advanced: toggling each checkbox updates the corresponding field", async () => {
    const user = userEvent.setup();
    const { getCurrent } = renderStateful();
    await user.click(screen.getByText("מתקדם"));

    await user.click(screen.getByRole("checkbox", { name: "הרצת סקריפטים מקומיים" }));
    expect(getCurrent().allowScripts).toBe(false); // starts true per DEFAULT_GOAL_CONFIG

    await user.click(screen.getByRole("checkbox", { name: "כתיבה לתיקייה המחוברת" }));
    expect(getCurrent().allowFolderWrite).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: "הצג תוכנית לאישור לפני הרצה" }));
    expect(getCurrent().requirePlanApproval).toBe(true);
  });

  it("shows the live $ estimate for a fixed level", () => {
    renderStateful();
    // BUDGET.md §1's own worked example for "standard" (2.5M tokens, ≈$3.4
    // rounded to one decimal there; formatUsd shows two decimals below $10).
    expect(screen.getByText("2.5M · ≈$3.38")).toBeInTheDocument();
  });
});
