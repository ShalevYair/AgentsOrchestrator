import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import "./i18n/index.js";
import { api, type KeyStatus, type Thread } from "./lib/api.js";
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

  /**
   * P9-T10: `region` ("content must be contained by a landmark") only
   * means something at this whole-shell level — every other component
   * test disables it (src/test/axe.ts) since a fragment mounted alone
   * would always trip it regardless of the real component. Checked here,
   * for real, against the actual <header>/<main> App.tsx renders.
   */
  it("has no axe violations, including landmark structure, in the real app shell (P9-T10)", async () => {
    vi.spyOn(api, "keyStatus").mockResolvedValue({
      hasKey: true,
      backend: "os-keyring",
      maskedKey: "sk-...abcd",
    });
    const { container } = render(<App />);
    await screen.findByTestId("chat-view-stub");
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});

function thread(id: string, title: string, updatedAt: string): Thread {
  return { id, title, createdAt: updatedAt, updatedAt, goalConfig: DEFAULT_GOAL_CONFIG };
}

const THREAD_A: Thread = thread("thr_a", "Thread A", "2026-01-02T00:00:00.000Z");
const THREAD_B: Thread = thread("thr_b", "Thread B", "2026-01-01T00:00:00.000Z");

/**
 * P9-T12: App.tsx now owns the real thread list/selection that used to
 * live inside ChatView — this exercises that wiring end to end against
 * the real ThreadSidebar (only ChatView itself is mocked; its own
 * extensive suite already covers its internals).
 */
describe("App thread management (P9-T12)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bootstraps by listing threads and selecting the first (most-recently-updated) one", async () => {
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: true, backend: "os-keyring", maskedKey: "x" });
    vi.spyOn(api, "listThreads").mockResolvedValue([THREAD_A, THREAD_B]);
    render(<App />);

    expect(await screen.findByText("Thread A")).toBeInTheDocument();
    expect(screen.getByText("Thread B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thread A" })).toHaveAttribute("aria-current", "true");
  });

  it("creates a fresh thread on mount when none exist yet", async () => {
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: true, backend: "os-keyring", maskedKey: "x" });
    vi.spyOn(api, "listThreads").mockResolvedValue([]);
    const createThread = vi
      .spyOn(api, "createThread")
      .mockResolvedValue(thread("thr_new", "New chat", "2026-01-03T00:00:00.000Z"));
    render(<App />);

    await waitFor(() => {
      expect(createThread).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole("button", { name: "שיחה חדשה" })).toHaveAttribute("aria-current", "true");
  });

  it("clicking '+ new chat' in the sidebar creates and selects a new thread", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: true, backend: "os-keyring", maskedKey: "x" });
    vi.spyOn(api, "listThreads").mockResolvedValue([THREAD_A]);
    vi.spyOn(api, "createThread").mockResolvedValue(
      thread("thr_new", "New chat", "2026-01-03T00:00:00.000Z"),
    );
    render(<App />);
    await screen.findByText("Thread A");

    await user.click(screen.getByRole("button", { name: "+ שיחה חדשה" }));

    const newRow = await screen.findByRole("button", { name: "שיחה חדשה" });
    expect(newRow).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Thread A" })).not.toHaveAttribute("aria-current");
  });

  it("selecting a different thread in the sidebar moves the active selection", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: true, backend: "os-keyring", maskedKey: "x" });
    vi.spyOn(api, "listThreads").mockResolvedValue([THREAD_A, THREAD_B]);
    render(<App />);
    await screen.findByText("Thread A");

    await user.click(screen.getByRole("button", { name: "Thread B" }));

    expect(screen.getByRole("button", { name: "Thread B" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Thread A" })).not.toHaveAttribute("aria-current");
  });

  it("deleting the selected thread selects the next remaining thread", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: true, backend: "os-keyring", maskedKey: "x" });
    vi.spyOn(api, "listThreads").mockResolvedValue([THREAD_A, THREAD_B]);
    vi.spyOn(api, "deleteThread").mockResolvedValue(undefined);
    render(<App />);
    await screen.findByText("Thread A");
    expect(screen.getByRole("button", { name: "Thread A" })).toHaveAttribute("aria-current", "true");

    await user.click(screen.getByRole("button", { name: 'מחיקת "Thread A"' }));

    expect(api.deleteThread).toHaveBeenCalledWith("thr_a");
    await waitFor(() => {
      expect(screen.queryByText("Thread A")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Thread B" })).toHaveAttribute("aria-current", "true");
  });

  it("deleting the only remaining thread creates and selects a fresh one instead of leaving the app empty", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(api, "keyStatus").mockResolvedValue({ hasKey: true, backend: "os-keyring", maskedKey: "x" });
    vi.spyOn(api, "listThreads").mockResolvedValue([THREAD_A]);
    vi.spyOn(api, "deleteThread").mockResolvedValue(undefined);
    const createThread = vi
      .spyOn(api, "createThread")
      .mockResolvedValue(thread("thr_new", "New chat", "2026-01-03T00:00:00.000Z"));
    render(<App />);
    await screen.findByText("Thread A");

    await user.click(screen.getByRole("button", { name: 'מחיקת "Thread A"' }));

    await waitFor(() => {
      expect(createThread).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole("button", { name: "שיחה חדשה" })).toHaveAttribute("aria-current", "true");
  });
});
