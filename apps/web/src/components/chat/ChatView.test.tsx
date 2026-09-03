import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RuntimeEvent } from "@ao/shared";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import "../../i18n/index.js";
import { api, type ChatMessage, type Thread } from "../../lib/api.js";
import type { WsStatus } from "../../lib/ws.js";
import { expectNoAxeViolations } from "../../test/axe.js";
import { ChatView } from "./ChatView.js";

interface FakeSocketHandlers {
  onEvent: (event: RuntimeEvent) => void;
  onStatusChange?: (status: WsStatus) => void;
}

interface FakeSocket {
  runId: string;
  handlers: FakeSocketHandlers;
  closed: boolean;
}

const sockets = vi.hoisted(() => ({ instances: [] as FakeSocket[] }));

vi.mock("../../lib/ws.js", () => ({
  RunEventSocket: class implements FakeSocket {
    closed = false;
    constructor(
      public runId: string,
      public handlers: FakeSocketHandlers,
    ) {
      sockets.instances.push(this);
    }
    close(): void {
      this.closed = true;
    }
  },
}));

function lastSocket(): FakeSocket {
  const instance = sockets.instances.at(-1);
  if (!instance) throw new Error("no RunEventSocket was constructed yet");
  return instance;
}

const THREAD: Thread = {
  id: "thread-1",
  title: "test thread",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  goalConfig: DEFAULT_GOAL_CONFIG,
};

const USER_MESSAGE: ChatMessage = {
  id: "msg-1",
  threadId: THREAD.id,
  role: "user",
  content: "hello",
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Loads the thread, then sends one message so a RunEventSocket exists to drive events/status through. */
async function renderReadyChatView(onOpenSettings = vi.fn()): Promise<FakeSocket> {
  const user = userEvent.setup();
  render(<ChatView onBudgetChange={vi.fn()} onOpenSettings={onOpenSettings} />);
  const textarea = await screen.findByRole("textbox");
  await waitFor(() => {
    expect(textarea).toBeEnabled();
  });
  await user.type(textarea, "hello{Enter}");
  await waitFor(() => {
    expect(sockets.instances.length).toBe(1);
  });
  return lastSocket();
}

describe("ChatView (UX.md §10 error states + reconnect banner)", () => {
  beforeEach(() => {
    sockets.instances.length = 0;
    vi.spyOn(api, "listThreads").mockResolvedValue([THREAD]);
    vi.spyOn(api, "listMessages").mockResolvedValue([]);
    vi.spyOn(api, "postMessage").mockResolvedValue({ runId: "run-1", userMessage: USER_MESSAGE });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a provider-scoped error with a working 'open settings' shortcut", async () => {
    const onOpenSettings = vi.fn();
    const socket = await renderReadyChatView(onOpenSettings);

    act(() => {
      socket.handlers.onEvent({
        type: "error",
        runId: "run-1",
        seq: 1,
        payload: {
          scope: "provider",
          code: "PROVIDER_REQUEST_FAILED",
          message: "הבקשה אל ספק המודל נכשלה. נסה שוב בעוד רגע.",
          recoverable: true,
        },
      });
    });

    expect(await screen.findByText("הבקשה אל ספק המודל נכשלה. נסה שוב בעוד רגע.")).toBeInTheDocument();
    const settingsButton = screen.getByRole("button", { name: "מעבר להגדרות" });

    const user = userEvent.setup();
    await user.click(settingsButton);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations with a provider-scoped error banner shown (P9-T10)", async () => {
    const socket = await renderReadyChatView();
    act(() => {
      socket.handlers.onEvent({
        type: "error",
        runId: "run-1",
        seq: 1,
        payload: {
          scope: "provider",
          code: "PROVIDER_REQUEST_FAILED",
          message: "הבקשה אל ספק המודל נכשלה. נסה שוב בעוד רגע.",
          recoverable: true,
        },
      });
    });
    await screen.findByText("הבקשה אל ספק המודל נכשלה. נסה שוב בעוד רגע.");
    await expectNoAxeViolations(document.body);
  });

  it("shows a budget-scoped error with the goal-button hint, no settings shortcut", async () => {
    const onOpenSettings = vi.fn();
    const socket = await renderReadyChatView(onOpenSettings);

    act(() => {
      socket.handlers.onEvent({
        type: "error",
        runId: "run-1",
        seq: 1,
        payload: {
          scope: "budget",
          code: "BUDGET_EXCEEDED",
          message: "התקציב שהוגדר אינו מספיק להמשך ברמה הנוכחית. המערכת מורידה דרגה אוטומטית.",
          recoverable: true,
        },
      });
    });

    expect(
      await screen.findByText("התקציב שהוגדר אינו מספיק להמשך ברמה הנוכחית. המערכת מורידה דרגה אוטומטית."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("אפשר להעלות את התקציב או לשנות רמה בכפתור המטרה שליד תיבת הכתיבה."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "מעבר להגדרות" })).not.toBeInTheDocument();
  });

  it("shows a transient 'connection restored' banner after a reconnecting -> open transition, then auto-dismisses", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const socket = await renderReadyChatView();

      act(() => {
        socket.handlers.onStatusChange?.("reconnecting");
      });
      expect(screen.getByText("החיבור לשרת נותק. מתחבר מחדש...")).toBeInTheDocument();

      act(() => {
        socket.handlers.onStatusChange?.("open");
      });
      expect(screen.getByText("החיבור התחדש.")).toBeInTheDocument();
      expect(screen.queryByText("החיבור לשרת נותק. מתחבר מחדש...")).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByText("החיבור התחדש.")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not show a 'connection restored' banner on the very first connect (nothing to restore)", async () => {
    const socket = await renderReadyChatView();

    act(() => {
      socket.handlers.onStatusChange?.("open");
    });

    expect(screen.queryByText("החיבור התחדש.")).not.toBeInTheDocument();
  });
});
