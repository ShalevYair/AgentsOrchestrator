import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import "../../i18n/index.js";
import { api, type Thread } from "../../lib/api.js";
import { expectNoAxeViolations } from "../../test/axe.js";
import { ThreadSidebar } from "./ThreadSidebar.js";

vi.mock("../../lib/download.js", () => ({
  downloadBlob: vi.fn(),
}));

function thread(id: string, title: string, updatedAt: string): Thread {
  return { id, title, createdAt: updatedAt, updatedAt, goalConfig: DEFAULT_GOAL_CONFIG };
}

const NOW = new Date();
const TODAY_ISO = NOW.toISOString();
const YESTERDAY_ISO = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();

const THREADS: Thread[] = [
  thread("thr_1", "ניתוח מאגר", TODAY_ISO),
  thread("thr_2", "ריפקטור", YESTERDAY_ISO),
];

describe("ThreadSidebar (P9-T12)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the heading, new-chat button, and search input", () => {
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    expect(screen.getByText("שיחות")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ שיחה חדשה" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "חיפוש בשיחות" })).toBeInTheDocument();
  });

  it("shows a loading message while threads haven't loaded yet", () => {
    render(
      <ThreadSidebar
        threads={[]}
        selectedThreadId={null}
        loading={true}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    expect(screen.getByText("טוען שיחות...")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no threads at all", () => {
    render(
      <ThreadSidebar
        threads={[]}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    expect(screen.getByText("אין שיחות עדיין")).toBeInTheDocument();
  });

  it("groups threads by date with the right labels, newest first", () => {
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    expect(screen.getByText("היום")).toBeInTheDocument();
    expect(screen.getByText("אתמול")).toBeInTheDocument();
    expect(screen.getByText("ניתוח מאגר")).toBeInTheDocument();
    expect(screen.getByText("ריפקטור")).toBeInTheDocument();
  });

  it("displays a default-titled thread with the localized 'untitled' label, not the raw stored string", () => {
    render(
      <ThreadSidebar
        threads={[thread("thr_3", "New chat", TODAY_ISO)]}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    expect(screen.getByText("שיחה חדשה")).toBeInTheDocument();
    expect(screen.queryByText("New chat")).not.toBeInTheDocument();
  });

  it("marks the selected thread with aria-current", () => {
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId="thr_1"
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "ניתוח מאגר" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "ריפקטור" })).not.toHaveAttribute("aria-current");
  });

  it("clicking a thread row calls onSelectThread with its id", async () => {
    const user = userEvent.setup();
    const onSelectThread = vi.fn();
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={onSelectThread}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "ניתוח מאגר" }));
    expect(onSelectThread).toHaveBeenCalledWith("thr_1");
  });

  it("clicking '+ new chat' calls onNewThread", async () => {
    const user = userEvent.setup();
    const onNewThread = vi.fn();
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={onNewThread}
        onDeleteThread={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ שיחה חדשה" }));
    expect(onNewThread).toHaveBeenCalledTimes(1);
  });

  it("search filters the list by title, case-insensitively", async () => {
    const user = userEvent.setup();
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    await user.type(screen.getByRole("searchbox"), "ריפקטור");
    expect(screen.queryByText("ניתוח מאגר")).not.toBeInTheDocument();
    expect(screen.getByText("ריפקטור")).toBeInTheDocument();
  });

  it("search with no matches shows the no-results message", async () => {
    const user = userEvent.setup();
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    await user.type(screen.getByRole("searchbox"), "xyz-does-not-exist");
    expect(screen.getByText("לא נמצאו שיחות תואמות")).toBeInTheDocument();
  });

  it("deleting: cancelling the confirm dialog does not call onDeleteThread", async () => {
    const user = userEvent.setup();
    const onDeleteThread = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={onDeleteThread}
      />,
    );
    await user.click(screen.getByRole("button", { name: 'מחיקת "ניתוח מאגר"' }));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- asserting on the mock's call log, never calling it unbound
    expect(window.confirm).toHaveBeenCalledWith('למחוק את השיחה "ניתוח מאגר"? הפעולה אינה הפיכה.');
    expect(onDeleteThread).not.toHaveBeenCalled();
  });

  it("deleting: confirming calls onDeleteThread with the thread's id", async () => {
    const user = userEvent.setup();
    const onDeleteThread = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={onDeleteThread}
      />,
    );
    await user.click(screen.getByRole("button", { name: 'מחיקת "ניתוח מאגר"' }));
    expect(onDeleteThread).toHaveBeenCalledWith("thr_1");
  });

  it("exporting: fetches the thread's messages and downloads a JSON file", async () => {
    const user = userEvent.setup();
    const { downloadBlob } = await import("../../lib/download.js");
    vi.spyOn(api, "listMessages").mockResolvedValue([
      { id: "m1", threadId: "thr_1", role: "user", content: "hi", createdAt: TODAY_ISO },
    ]);
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: 'ייצוא "ניתוח מאגר" כ-JSON' }));

    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledTimes(1);
    });
    const [filename, data, mimeType] = vi.mocked(downloadBlob).mock.calls[0]!;
    expect(filename).toBe("ניתוח מאגר.json");
    expect(mimeType).toBe("application/json");
    const parsed = JSON.parse(data as string) as { thread: Thread; messages: unknown[] };
    expect(parsed.thread.id).toBe("thr_1");
    expect(parsed.messages).toHaveLength(1);
    // The done-criterion (TASKS.md P9-T12): the export must never carry an API key.
    expect(data as string).not.toContain("apiKey");
    expect(data as string).not.toContain("AIza");
  });

  it("exporting: a failed fetch shows an error instead of silently doing nothing", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listMessages").mockRejectedValue(new Error("network down"));
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: 'ייצוא "ניתוח מאגר" כ-JSON' }));

    expect(await screen.findByText("ייצוא השיחה נכשל. נסו שוב.")).toBeInTheDocument();
  });

  it("collapsing hides the list; the toggle re-expands it", async () => {
    const user = userEvent.setup();
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "כווץ את רשימת השיחות" }));
    expect(screen.queryByText("ניתוח מאגר")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ שיחה חדשה" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "הרחב את רשימת השיחות" }));
    expect(screen.getByText("ניתוח מאגר")).toBeInTheDocument();
  });

  it("collapsing a date group hides its threads without affecting other groups", async () => {
    const user = userEvent.setup();
    render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId={null}
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "היום" }));
    expect(screen.queryByText("ניתוח מאגר")).not.toBeInTheDocument();
    expect(screen.getByText("ריפקטור")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <ThreadSidebar
        threads={THREADS}
        selectedThreadId="thr_1"
        loading={false}
        onSelectThread={vi.fn()}
        onNewThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />,
    );
    await expectNoAxeViolations(container);
  });
});
