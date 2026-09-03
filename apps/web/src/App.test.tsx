import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./i18n/index.js";
import { api, type KeyStatus } from "./lib/api.js";
import App from "./App.js";

vi.mock("./components/chat/ChatView.js", () => ({
  ChatView: () => <div data-testid="chat-view-stub" />,
}));

/** UX.md §10's "אין מפתח API" row — App.tsx routes between OnboardingScreen and ChatView based on real `api.keyStatus()` results, never a fabricated state. */
describe("App (UX.md §10 onboarding routing)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders ChatView optimistically before keyStatus resolves", () => {
    vi.spyOn(api, "keyStatus").mockReturnValue(new Promise<KeyStatus>(() => undefined));
    render(<App />);
    expect(screen.getByTestId("chat-view-stub")).toBeInTheDocument();
  });

  it("shows the onboarding screen once keyStatus resolves with hasKey: false", async () => {
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: false, backend: null, maskedKey: null });
    render(<App />);
    expect(await screen.findByText("ברוכים הבאים ל-AgentsOrchestrator")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-view-stub")).not.toBeInTheDocument();
  });

  it("shows ChatView (not onboarding) once keyStatus resolves with hasKey: true", async () => {
    vi.spyOn(api, "keyStatus").mockResolvedValue({
      hasKey: true,
      backend: "os-keyring",
      maskedKey: "sk-...abcd",
    });
    render(<App />);
    await waitFor(() => {
      expect(api.keyStatus).toHaveBeenCalled();
    });
    expect(screen.getByTestId("chat-view-stub")).toBeInTheDocument();
    expect(screen.queryByText("ברוכים הבאים ל-AgentsOrchestrator")).not.toBeInTheDocument();
  });

  it("fails open to ChatView when keyStatus rejects (runtime unreachable)", async () => {
    vi.spyOn(api, "keyStatus").mockRejectedValue(new Error("network down"));
    render(<App />);
    expect(await screen.findByTestId("chat-view-stub")).toBeInTheDocument();
  });

  it("'continue with mock' dismisses onboarding and reveals ChatView", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: false, backend: null, maskedKey: null });
    render(<App />);
    await screen.findByText("ברוכים הבאים ל-AgentsOrchestrator");

    await user.click(screen.getByRole("button", { name: "המשך בלי מפתח (מצב הדגמה)" }));

    expect(screen.getByTestId("chat-view-stub")).toBeInTheDocument();
    expect(screen.queryByText("ברוכים הבאים ל-AgentsOrchestrator")).not.toBeInTheDocument();
  });

  it("'open settings' from onboarding opens the SettingsDialog", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: false, backend: null, maskedKey: null });
    render(<App />);
    await screen.findByText("ברוכים הבאים ל-AgentsOrchestrator");

    await user.click(screen.getByRole("button", { name: "פתח הגדרות" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("closing Settings after a key was added re-checks status and dismisses onboarding", async () => {
    const user = userEvent.setup();
    const keyStatus = vi
      .spyOn(api, "keyStatus")
      .mockResolvedValueOnce({ hasKey: false, backend: null, maskedKey: null })
      .mockResolvedValue({ hasKey: true, backend: "os-keyring", maskedKey: "sk-...abcd" });
    render(<App />);
    await screen.findByText("ברוכים הבאים ל-AgentsOrchestrator");

    await user.click(screen.getByRole("button", { name: "פתח הגדרות" }));
    const dialog = await screen.findByRole("dialog");
    expect(keyStatus).toHaveBeenCalledTimes(2); // App's mount check + ApiKeyForm's own mount check.

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId("chat-view-stub")).toBeInTheDocument();
    });
    expect(screen.queryByText("ברוכים הבאים ל-AgentsOrchestrator")).not.toBeInTheDocument();
  });
});
