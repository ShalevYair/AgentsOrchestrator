import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { expectNoAxeViolations } from "../../test/axe.js";
import { SettingsDialog } from "./SettingsDialog.js";

describe("SettingsDialog (UX.md §8)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the real masked key and storage backend once loaded", async () => {
    vi.spyOn(api, "keyStatus").mockResolvedValue({
      hasKey: true,
      backend: "os-keyring",
      maskedKey: "AIza••••3f2a",
    });
    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    expect(await screen.findByText("AIza••••3f2a")).toBeInTheDocument();
    expect(screen.getByText("נשמר ב-Keychain המאובטח של מערכת ההפעלה")).toBeInTheDocument();
  });

  it("shows the real API key link when there's no key yet", async () => {
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: false, backend: null, maskedKey: null });
    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "https://aistudio.google.com/app/apikey");
  });

  it("has no axe violations with a stored key, delete button, and language switcher all shown (P9-T10)", async () => {
    vi.spyOn(api, "keyStatus").mockResolvedValue({
      hasKey: true,
      backend: "encrypted-file",
      maskedKey: "AIza••••3f2a",
    });
    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    await screen.findByText("AIza••••3f2a");
    // Radix's Dialog content is portaled onto document.body.
    await expectNoAxeViolations(document.body);
  });

  it("has no axe violations in the no-key state either (P9-T10)", async () => {
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: false, backend: null, maskedKey: null });
    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    await screen.findByRole("link");
    await expectNoAxeViolations(document.body);
  });

  it("closing via Escape calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: false, backend: null, maskedKey: null });
    const onOpenChange = vi.fn();
    render(<SettingsDialog open onOpenChange={onOpenChange} />);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
