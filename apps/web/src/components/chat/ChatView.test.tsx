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
  render(<ChatView thread={THREAD} onBudgetChange={vi.fn()} onOpenSettings={onOpenSettings} />);
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

describe("ChatView stop / run control (UX.md §2 + §9, P9-T11)", () => {
  beforeEach(() => {
    sockets.instances.length = 0;
    vi.spyOn(api, "listMessages").mockResolvedValue([]);
    vi.spyOn(api, "postMessage").mockResolvedValue({ runId: "run-1", userMessage: USER_MESSAGE });
    vi.spyOn(api, "stopRun").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fireRunStarted(socket: FakeSocket): void {
    act(() => {
      socket.handlers.onEvent({
        type: "run.started",
        runId: "run-1",
        seq: 1,
        payload: { runId: "run-1", budget: 2_500_000, mode: "standard" },
      });
    });
  }

  it("clicking the real stop button calls api.stopRun with the current run's id", async () => {
    const user = userEvent.setup();
    const socket = await renderReadyChatView();
    fireRunStarted(socket);

    await user.click(screen.getByRole("button", { name: "עצור" }));

    expect(api.stopRun).toHaveBeenCalledWith("run-1");
  });

  it("a run.finished with status 'stopped' shows the partial-answer notice and re-enables the composer", async () => {
    const socket = await renderReadyChatView();
    fireRunStarted(socket);

    act(() => {
      socket.handlers.onEvent({
        type: "run.finished",
        runId: "run-1",
        seq: 2,
        payload: { status: "stopped", deliverables: [], ledger: null, gaps: [] },
      });
    });

    expect(await screen.findByText("הריצה נעצרה. התשובה למעלה חלקית.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "שלח" })).toBeInTheDocument();
  });

  it("a normal completed run.finished never shows the stopped notice", async () => {
    const socket = await renderReadyChatView();
    fireRunStarted(socket);

    act(() => {
      socket.handlers.onEvent({
        type: "run.finished",
        runId: "run-1",
        seq: 2,
        payload: { status: "completed", deliverables: [], ledger: null, gaps: [] },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "שלח" })).toBeInTheDocument();
    });
    expect(screen.queryByText("הריצה נעצרה. התשובה למעלה חלקית.")).not.toBeInTheDocument();
  });

  it("sending a new message clears a previous stop notice", async () => {
    const user = userEvent.setup();
    const socket = await renderReadyChatView();
    fireRunStarted(socket);
    act(() => {
      socket.handlers.onEvent({
        type: "run.finished",
        runId: "run-1",
        seq: 2,
        payload: { status: "stopped", deliverables: [], ledger: null, gaps: [] },
      });
    });
    await screen.findByText("הריצה נעצרה. התשובה למעלה חלקית.");

    await user.type(screen.getByRole("textbox"), "עוד הודעה{Enter}");

    expect(screen.queryByText("הריצה נעצרה. התשובה למעלה חלקית.")).not.toBeInTheDocument();
  });

  it("pressing Escape while a run is active calls stop", async () => {
    const user = userEvent.setup();
    const socket = await renderReadyChatView();
    fireRunStarted(socket);

    await user.keyboard("{Escape}");

    expect(api.stopRun).toHaveBeenCalledWith("run-1");
  });

  it("pressing Escape while a dialog is open closes the dialog instead of stopping the run", async () => {
    const user = userEvent.setup();
    const socket = await renderReadyChatView();
    fireRunStarted(socket);

    // The goal button's own popover is a real Radix dialog rendered inside ChatView.
    await user.click(screen.getByRole("button", { name: /מטרה/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(api.stopRun).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

describe("ChatView controlled `thread` prop (P9-T12)", () => {
  beforeEach(() => {
    sockets.instances.length = 0;
    vi.spyOn(api, "listMessages").mockResolvedValue([]);
    vi.spyOn(api, "postMessage").mockResolvedValue({ runId: "run-1", userMessage: USER_MESSAGE });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts its shell immediately even with thread=null (App.tsx's optimistic pre-bootstrap window)", () => {
    render(<ChatView thread={null} onBudgetChange={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    // Never called `api.listMessages` for a thread that doesn't exist yet.
    expect(api.listMessages).not.toHaveBeenCalled();
  });

  it("enables the composer once a real thread is passed", async () => {
    render(<ChatView thread={THREAD} onBudgetChange={vi.fn()} onOpenSettings={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeEnabled();
    });
    expect(api.listMessages).toHaveBeenCalledWith(THREAD.id);
  });

  it("calls onThreadActivity when a run finishes (the sidebar's cue to re-sort)", async () => {
    const onThreadActivity = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatView
        thread={THREAD}
        onBudgetChange={vi.fn()}
        onOpenSettings={vi.fn()}
        onThreadActivity={onThreadActivity}
      />,
    );
    const textarea = await screen.findByRole("textbox");
    await waitFor(() => {
      expect(textarea).toBeEnabled();
    });
    await user.type(textarea, "hello{Enter}");
    await waitFor(() => {
      expect(sockets.instances.length).toBe(1);
    });
    expect(onThreadActivity).not.toHaveBeenCalled();

    act(() => {
      lastSocket().handlers.onEvent({
        type: "run.finished",
        runId: "run-1",
        seq: 1,
        payload: { status: "completed", deliverables: [], ledger: null, gaps: [] },
      });
    });

    expect(onThreadActivity).toHaveBeenCalledTimes(1);
  });
});
