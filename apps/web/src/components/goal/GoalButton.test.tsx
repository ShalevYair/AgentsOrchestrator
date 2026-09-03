import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import "../../i18n/index.js";
import { expectNoAxeViolations } from "../../test/axe.js";
import { GoalButton } from "./GoalButton.js";

describe("GoalButton (UX.md §3)", () => {
  it("the trigger tag shows the current level and token count", () => {
    render(<GoalButton value={DEFAULT_GOAL_CONFIG} onChange={vi.fn()} saveError={null} />);
    expect(screen.getByRole("button", { name: /סטנדרט/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2\.5M/ })).toBeInTheDocument();
  });

  it("reflects a non-default value in the trigger", () => {
    render(
      <GoalButton
        value={{ ...DEFAULT_GOAL_CONFIG, level: "deep", budgetTotal: 5_000_000 }}
        onChange={vi.fn()}
        saveError={null}
      />,
    );
    expect(screen.getByRole("button", { name: /עומק/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /5M/ })).toBeInTheDocument();
  });

  it("clicking the trigger opens the full form", async () => {
    const user = userEvent.setup();
    render(<GoalButton value={DEFAULT_GOAL_CONFIG} onChange={vi.fn()} saveError={null} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /סטנדרט/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /טיוטה/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /עומק/ })).toBeInTheDocument();
  });

  it("changing a field inside the dialog calls onChange with the updated config", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GoalButton value={DEFAULT_GOAL_CONFIG} onChange={onChange} saveError={null} />);
    await user.click(screen.getByRole("button", { name: /סטנדרט/ }));
    await user.click(screen.getByRole("radio", { name: /טיוטה/ }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ level: "draft", budgetTotal: 500_000 }));
  });

  it("shows a save error inline when persistence failed", async () => {
    const user = userEvent.setup();
    render(
      <GoalButton
        value={DEFAULT_GOAL_CONFIG}
        onChange={vi.fn()}
        saveError="שמירת הגדרות המטרה נכשלה. נסו שוב."
      />,
    );
    await user.click(screen.getByRole("button", { name: /סטנדרט/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("שמירת הגדרות המטרה נכשלה");
  });

  it("has no axe violations with the form open and a save error shown (P9-T10)", async () => {
    const user = userEvent.setup();
    render(
      <GoalButton
        value={DEFAULT_GOAL_CONFIG}
        onChange={vi.fn()}
        saveError="שמירת הגדרות המטרה נכשלה. נסו שוב."
      />,
    );
    await user.click(screen.getByRole("button", { name: /סטנדרט/ }));
    // Radix's Popover content is portaled onto document.body, not a
    // descendant of the render container — check the whole document.
    await expectNoAxeViolations(document.body);
  });
});
