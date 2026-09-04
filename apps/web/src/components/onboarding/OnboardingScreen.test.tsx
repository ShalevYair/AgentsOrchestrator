import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../i18n/index.js";
import { expectNoAxeViolations } from "../../test/axe.js";
import { OnboardingScreen } from "./OnboardingScreen.js";

describe("OnboardingScreen (UX.md §10 'אין מפתח API')", () => {
  it("renders the real Google AI Studio API key link", () => {
    render(<OnboardingScreen onOpenSettings={vi.fn()} onContinue={vi.fn()} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://aistudio.google.com/app/apikey");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("calls onOpenSettings when 'פתח הגדרות' is clicked", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    render(<OnboardingScreen onOpenSettings={onOpenSettings} onContinue={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "פתח הגדרות" }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("calls onContinue when 'המשך בלי מפתח' is clicked", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<OnboardingScreen onOpenSettings={vi.fn()} onContinue={onContinue} />);

    await user.click(screen.getByRole("button", { name: "המשך בלי מפתח (מצב הדגמה)" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations (P9-T10)", async () => {
    const { container } = render(<OnboardingScreen onOpenSettings={vi.fn()} onContinue={vi.fn()} />);
    await expectNoAxeViolations(container);
  });
});
