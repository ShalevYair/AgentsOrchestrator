import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import "../../i18n/index.js";
import { ChatInput } from "./ChatInput.js";

/** Every render needs these two — factored out so each test only states what it's actually varying. */
const goalProps = { goalConfig: DEFAULT_GOAL_CONFIG, onGoalConfigChange: vi.fn() };

describe("ChatInput (UX.md §2)", () => {
  it("Enter sends the message and clears the field", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} {...goalProps} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "שלום עולם{Enter}");

    expect(onSend).toHaveBeenCalledWith("שלום עולם");
    expect(textarea).toHaveValue("");
  });

  it("Shift+Enter inserts a newline instead of sending", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} {...goalProps} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "line one{Shift>}{Enter}{/Shift}line two");

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("line one\nline two");
  });

  it("does not send an empty/whitespace-only message", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} {...goalProps} />);

    await user.type(screen.getByRole("textbox"), "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the textarea and send button while a reply is streaming", () => {
    render(<ChatInput onSend={vi.fn()} disabled {...goalProps} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    // The send button's accessible name stays "שלח" (its aria-label) even
    // while its visible text switches to "שולח..." — aria-label always
    // wins over text content, pre-existing P2-T4 behavior, not changed here.
    expect(screen.getByRole("button", { name: "שלח" })).toBeDisabled();
  });

  it("also renders the goal button (P9-T1), separate from the send button", () => {
    render(<ChatInput onSend={vi.fn()} {...goalProps} />);
    expect(screen.getByRole("button", { name: "שלח" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /מטרה/ })).toBeInTheDocument();
  });
});
