import * as React from "react";
import { useTranslation } from "react-i18next";
import { api, type Thread } from "../../lib/api.js";
import { downloadBlob } from "../../lib/download.js";
import { groupThreadsByDate, type ThreadGroupLabel } from "../../lib/thread-groups.js";
import { Button } from "../ui/button.js";
import { ChevronDown, Download, Search, Trash } from "../ui/icons.js";

export interface ThreadSidebarProps {
  threads: Thread[];
  selectedThreadId: string | null;
  loading: boolean;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
}

const GROUP_LABEL_KEY: Record<ThreadGroupLabel, string> = {
  today: "threads.groupToday",
  yesterday: "threads.groupYesterday",
  older: "threads.groupOlder",
};

/** The exact server-side default from routes/threads.ts's `createThread` — displayed localized (`threads.untitled`) rather than stored localized, so the stored title stays a stable, locale-independent value. */
const DEFAULT_THREAD_TITLE = "New chat";

/**
 * P9-T12's "שיחות" column (UX.md §1): a collapsible left rail with a
 * "+ חדשה" button, a client-side title search (no server-side search
 * endpoint exists or is needed for what's realistically a per-user list),
 * and a date-grouped (Today/Yesterday/Older) thread list. Each row also
 * carries the row-level export (whole thread as JSON, UX.md's "ייצוא
 * ריצה" — this app has no run-scoped or multi-run UI to export a single
 * run *from*, so "export" means the one real, honest unit that exists:
 * the thread's full conversation) and delete (P9-T12, `deleteThread` /
 * `DELETE /api/threads/:id`) actions.
 */
export function ThreadSidebar({
  threads,
  selectedThreadId,
  loading,
  onSelectThread,
  onNewThread,
  onDeleteThread,
}: ThreadSidebarProps): React.JSX.Element {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [collapsedGroups, setCollapsedGroups] = React.useState<ReadonlySet<ThreadGroupLabel>>(new Set());
  const [exportingId, setExportingId] = React.useState<string | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length === 0) return threads;
    return threads.filter((thread) => thread.title.toLowerCase().includes(trimmed));
  }, [threads, query]);

  const groups = React.useMemo(() => groupThreadsByDate(filtered), [filtered]);

  const toggleGroup = (label: ThreadGroupLabel): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleExport = (thread: Thread): void => {
    setExportError(null);
    setExportingId(thread.id);
    api
      .listMessages(thread.id)
      .then((messages) => {
        const payload = { thread, messages };
        downloadBlob(
          `${thread.title || DEFAULT_THREAD_TITLE}.json`,
          JSON.stringify(payload, null, 2),
          "application/json",
        );
      })
      .catch(() => {
        setExportError(t("threads.exportError"));
      })
      .finally(() => {
        setExportingId(null);
      });
  };

  const displayTitle = (thread: Thread): string =>
    thread.title === DEFAULT_THREAD_TITLE ? t("threads.untitled") : thread.title;

  const handleDelete = (thread: Thread): void => {
    if (window.confirm(t("threads.deleteConfirm", { title: displayTitle(thread) }))) {
      onDeleteThread(thread.id);
    }
  };

  if (collapsed) {
    return (
      <aside
        className="flex flex-none flex-col border-e border-neutral-200 dark:border-neutral-800"
        data-testid="thread-sidebar"
      >
        <button
          type="button"
          onClick={() => {
            setCollapsed(false);
          }}
          aria-expanded={false}
          aria-label={t("threads.expand")}
          className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronDown className="-rotate-90" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="flex w-64 flex-none flex-col border-e border-neutral-200 dark:border-neutral-800"
      data-testid="thread-sidebar"
    >
      <div className="flex flex-none items-center justify-between gap-1 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <h2 className="truncate text-sm font-medium">{t("threads.heading")}</h2>
        <button
          type="button"
          onClick={() => {
            setCollapsed(true);
          }}
          aria-expanded={true}
          aria-label={t("threads.collapse")}
          className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronDown className="rotate-90" />
        </button>
      </div>
      <div className="flex-none p-2">
        <Button size="sm" className="w-full" onClick={onNewThread}>
          {t("threads.newChat")}
        </Button>
      </div>
      <div className="flex-none px-2 pb-2">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-2 my-auto text-neutral-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder={t("threads.searchPlaceholder")}
            aria-label={t("threads.searchPlaceholder")}
            className="w-full rounded-md border border-neutral-300 bg-transparent py-1.5 ps-7 pe-2 text-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-neutral-700 dark:placeholder:text-neutral-500"
          />
        </div>
        {exportError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{exportError}</p>}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading && (
          <p className="px-1 py-2 text-xs text-neutral-500 dark:text-neutral-400">{t("threads.loading")}</p>
        )}
        {!loading && threads.length === 0 && (
          <p className="px-1 py-2 text-xs text-neutral-500 dark:text-neutral-400">{t("threads.empty")}</p>
        )}
        {!loading && threads.length > 0 && filtered.length === 0 && (
          <p className="px-1 py-2 text-xs text-neutral-500 dark:text-neutral-400">{t("threads.noResults")}</p>
        )}
        {groups.map((group) => {
          const isOpen = !collapsedGroups.has(group.label);
          return (
            <div key={group.label} className="mb-1">
              <button
                type="button"
                onClick={() => {
                  toggleGroup(group.label);
                }}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-1 rounded px-1 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <ChevronDown className={isOpen ? undefined : "-rotate-90"} />
                {t(GROUP_LABEL_KEY[group.label])}
              </button>
              {isOpen && (
                <ul>
                  {group.threads.map((thread) => (
                    <li key={thread.id} className="group/row flex items-center gap-1 rounded-md">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectThread(thread.id);
                        }}
                        aria-current={thread.id === selectedThreadId ? "true" : undefined}
                        className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-start text-sm ${
                          thread.id === selectedThreadId
                            ? "bg-neutral-100 dark:bg-neutral-800"
                            : "hover:bg-neutral-50 dark:hover:bg-neutral-900"
                        }`}
                      >
                        <bdi>{displayTitle(thread)}</bdi>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleExport(thread);
                        }}
                        disabled={exportingId === thread.id}
                        aria-label={t("threads.export", { title: displayTitle(thread) })}
                        className="shrink-0 rounded p-1 text-neutral-400 opacity-0 hover:bg-neutral-200 hover:text-neutral-700 focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 disabled:opacity-50 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                      >
                        <Download />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleDelete(thread);
                        }}
                        aria-label={t("threads.delete", { title: displayTitle(thread) })}
                        className="shrink-0 rounded p-1 text-neutral-400 opacity-0 hover:bg-red-100 hover:text-red-700 focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 dark:hover:bg-red-900/40 dark:hover:text-red-300"
                      >
                        <Trash />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
