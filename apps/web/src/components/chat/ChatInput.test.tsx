import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import "../../i18n/index.js";
import { expectNoAxeViolations } from "../../test/axe.js";
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

describe("ChatInput attachments (UX.md §2, P9-T8)", () => {
  function fileInput(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("file input not found");
    return input as HTMLInputElement;
  }

  async function attach(container: HTMLElement, file: File): Promise<void> {
    const input = fileInput(container);
    const user = userEvent.setup();
    await user.upload(input, file);
  }

  it("attaching a text file shows a real card with its name, size, and a real token estimate", async () => {
    const { container } = render(<ChatInput onSend={vi.fn()} {...goalProps} />);
    await attach(container, new File(["hello world, testing token estimation"], "notes.txt"));

    expect(await screen.findByText("notes.txt")).toBeInTheDocument();
    expect(screen.getByText(/~\d+ טוקנים/)).toBeInTheDocument();
  });

  it("attaching an image shows 'not available' instead of a fabricated estimate", async () => {
    const { container } = render(<ChatInput onSend={vi.fn()} {...goalProps} />);
    await attach(container, new File([new Uint8Array([0, 1, 2])], "photo.png", { type: "image/png" }));

    expect(await screen.findByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("לא זמין לסוג קובץ זה")).toBeInTheDocument();
  });

  it("removing an attachment's card removes it from state — send composes without it", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { container } = render(<ChatInput onSend={onSend} {...goalProps} />);
    await attach(container, new File(["content"], "a.txt"));
    await screen.findByText("a.txt");

    await user.click(screen.getByRole("button", { name: /a\.txt/ }));
    expect(screen.queryByText("a.txt")).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "hi{Enter}");
    expect(onSend).toHaveBeenCalledWith("hi");
  });

  it("send is enabled with an attachment alone, even with no typed text", async () => {
    const { container } = render(<ChatInput onSend={vi.fn()} {...goalProps} />);
    expect(screen.getByRole("button", { name: "שלח" })).toBeDisabled();

    await attach(container, new File(["content"], "a.txt"));
    await screen.findByText("a.txt");
    expect(screen.getByRole("button", { name: "שלח" })).not.toBeDisabled();
  });

  it("sending composes the typed text with the attached file's real content, and clears both", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { container } = render(<ChatInput onSend={onSend} {...goalProps} />);
    await attach(container, new File(["the actual file content"], "a.txt"));
    await screen.findByText("a.txt");

    await user.type(screen.getByRole("textbox"), "check this out{Enter}");

    expect(onSend).toHaveBeenCalledTimes(1);
    const sent = onSend.mock.calls[0]?.[0] as string;
    expect(sent).toContain("check this out");
    expect(sent).toContain("a.txt");
    expect(sent).toContain("the actual file content");

    // Both the text and the attachment list reset after sending.
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.queryByText("a.txt")).not.toBeInTheDocument();
  });

  it("an unsupported (binary) attachment's real content is never sent — only a note that it wasn't", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { container } = render(<ChatInput onSend={onSend} {...goalProps} />);
    await attach(container, new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" }));
    await screen.findByText("photo.png");

    await user.type(screen.getByRole("textbox"), "look{Enter}");

    const sent = onSend.mock.calls[0]?.[0] as string;
    expect(sent).toContain("photo.png");
    expect(sent).not.toContain(String.fromCharCode(1, 2, 3));
  });

  it("has no axe violations with an attachment card, goal button, and typed text all present (P9-T10)", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChatInput onSend={vi.fn()} {...goalProps} />);
    await attach(container, new File(["hello world"], "notes.txt"));
    await screen.findByText("notes.txt");
    await user.type(screen.getByRole("textbox"), "look at this");

    await expectNoAxeViolations(container);
  });
});
