import * as React from "react";
import { useTranslation } from "react-i18next";
import { isRtl } from "./i18n/index.js";
import { api, type Thread } from "./lib/api.js";
import type { BudgetMeterInfo } from "./lib/budget-projection.js";
import { Header } from "./components/layout/Header.js";
import { ChatView } from "./components/chat/ChatView.js";
import { ThreadSidebar } from "./components/threads/ThreadSidebar.js";
import { SettingsDialog } from "./components/settings/SettingsDialog.js";
import { OnboardingScreen } from "./components/onboarding/OnboardingScreen.js";

/**
 * ADR-010: `dir`/`lang` on `<html>` react live to a language switch, not
 * just at initial load — driven off `i18n.language` here rather than a
 * one-time index.html attribute.
 */
function useDocumentLocale(): string {
  const { i18n } = useTranslation();
  React.useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = isRtl(i18n.language) ? "rtl" : "ltr";
  }, [i18n.language]);
  return i18n.language;
}

export default function App(): React.JSX.Element {
  useDocumentLocale();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [budgetInfo, setBudgetInfo] = React.useState<BudgetMeterInfo | null>(null);
  // UX.md §10 "אין מפתח API": null while we haven't heard back yet (we
  // optimistically render ChatView during that window, matching prior
  // behavior), then true/false once `api.keyStatus()` resolves.
  const [hasKey, setHasKey] = React.useState<boolean | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = React.useState(false);

  // P9-T12: App.tsx owns the thread list/selection (the history sidebar
  // needs the whole list; ChatView only ever needs the one selected
  // thread) — `null` only until the very first thread resolves.
  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = React.useState(true);
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);
  // Real bug, found via P9-T12's real-browser verification (React.StrictMode
  // double-invokes effects in dev — a `<StrictMode>` mount → cleanup →
  // mount cycle, with state/refs preserved across it): without this guard,
  // the bootstrap effect below fires its `listThreads` → (empty ⇒)
  // `createThread` sequence twice against the still-empty DB before either
  // call's result comes back, silently creating two threads on a single
  // fresh load. A `cancelled` flag alone doesn't help — it only skips the
  // *state update* after the fact, not the real POST already in flight.
  const bootstrappedRef = React.useRef(false);

  const refreshKeyStatus = React.useCallback((): void => {
    api
      .keyStatus()
      .then((status) => {
        setHasKey(status.hasKey);
      })
      .catch(() => {
        // Runtime unreachable at all is a bigger problem than this nicety —
        // fail open so an unreachable status check never blocks chat.
        setHasKey(true);
      });
  }, []);

  React.useEffect(() => {
    refreshKeyStatus();
  }, [refreshKeyStatus]);

  /** P9-T12: re-sorts/refreshes the sidebar once a run actually changes a thread (ChatView's `onThreadActivity`, fired on `run.finished`). */
  const refreshThreads = React.useCallback((): void => {
    api
      .listThreads()
      .then((list) => {
        setThreads(list);
      })
      .catch(() => {
        // Best-effort — the sidebar just keeps showing what it already has.
      });
  }, []);

  React.useEffect(() => {
    // No `cancelled`-flag cleanup here on purpose: under StrictMode, the
    // *first* invocation's cleanup would still fire (synchronously, before
    // the chain below resolves) even though `bootstrappedRef` deliberately
    // keeps that first invocation's chain as the one real chain in flight
    // — a `cancelled` flag closed over by that same invocation would poison
    // its own result and silently drop the `setThreads`/`setThreadsLoading`
    // calls once the (only) chain resolves. React 18 already no-ops a
    // setState from a genuinely unmounted component, so there's nothing
    // real to guard against by skipping it ourselves.
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    api
      .listThreads()
      .then(async (list) => (list.length > 0 ? list : [await api.createThread()]))
      .then((resolved) => {
        setThreads(resolved);
        setSelectedThreadId(resolved[0]?.id ?? null);
      })
      .catch(() => {
        // An unreachable backend leaves the sidebar empty; ChatView still
        // renders its shell with thread=null (composer stays disabled).
      })
      .finally(() => {
        setThreadsLoading(false);
      });
  }, []);

  const handleNewThread = (): void => {
    api
      .createThread()
      .then((created) => {
        setThreads((prev) => [created, ...prev]);
        setSelectedThreadId(created.id);
      })
      .catch(() => {
        // Best-effort — the user can just click "+" again.
      });
  };

  const handleDeleteThread = (id: string): void => {
    api
      .deleteThread(id)
      .then(async () => {
        const remaining = threads.filter((thread) => thread.id !== id);
        if (id !== selectedThreadId) {
          setThreads(remaining);
          return;
        }
        if (remaining.length > 0) {
          setThreads(remaining);
          setSelectedThreadId(remaining[0]!.id);
        } else {
          const created = await api.createThread();
          setThreads([created]);
          setSelectedThreadId(created.id);
        }
      })
      .catch(() => {
        // Best-effort — the thread stays in the list so the user can retry.
      });
  };

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;

  return (
    <div className="flex h-screen flex-col">
      <Header budgetInfo={budgetInfo} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex flex-1 overflow-hidden">
        {hasKey === false && !onboardingDismissed ? (
          <OnboardingScreen
            onOpenSettings={() => setSettingsOpen(true)}
            onContinue={() => setOnboardingDismissed(true)}
          />
        ) : (
          <>
            <ThreadSidebar
              threads={threads}
              selectedThreadId={selectedThreadId}
              loading={threadsLoading}
              onSelectThread={setSelectedThreadId}
              onNewThread={handleNewThread}
              onDeleteThread={handleDeleteThread}
            />
            {/* Keyed by thread id: switching threads is a fresh ChatView
                instance, which is the simplest guarantee that *all* of its
                internal state (messages, goalConfig, runState, the WS
                socket) resets — see ChatViewProps's doc comment. */}
            <ChatView
              key={selectedThreadId ?? "pending"}
              thread={selectedThread}
              onBudgetChange={setBudgetInfo}
              onOpenSettings={() => setSettingsOpen(true)}
              onThreadActivity={refreshThreads}
            />
          </>
        )}
      </main>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) refreshKeyStatus();
        }}
      />
    </div>
  );
}
