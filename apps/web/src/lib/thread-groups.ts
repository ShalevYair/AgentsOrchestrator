import type { Thread } from "./api.js";

export type ThreadGroupLabel = "today" | "yesterday" | "older";

export interface ThreadGroup {
  label: ThreadGroupLabel;
  threads: Thread[];
}

/**
 * UX.md §1's "▸ היום" / "▸ אתמול" date buckets for the history sidebar.
 * Boundaries are local calendar days (midnight to midnight in the
 * browser's own timezone, via `now`'s own getFullYear/Month/Date) rather
 * than a rolling 24h window — matches how a person reads "today" in a
 * sidebar, not a strict duration. Groups with no threads are omitted
 * rather than rendered empty. Assumes `threads` is already sorted
 * newest-updated first (true of `api.listThreads()`'s `ORDER BY
 * updated_at DESC`) and preserves that order within each group.
 */
export function groupThreadsByDate(threads: readonly Thread[], now: Date = new Date()): ThreadGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  const today: Thread[] = [];
  const yesterday: Thread[] = [];
  const older: Thread[] = [];

  for (const thread of threads) {
    const updatedAt = new Date(thread.updatedAt).getTime();
    if (Number.isNaN(updatedAt) || updatedAt < startOfYesterday) {
      older.push(thread);
    } else if (updatedAt < startOfToday) {
      yesterday.push(thread);
    } else {
      today.push(thread);
    }
  }

  const groups: ThreadGroup[] = [];
  if (today.length > 0) groups.push({ label: "today", threads: today });
  if (yesterday.length > 0) groups.push({ label: "yesterday", threads: yesterday });
  if (older.length > 0) groups.push({ label: "older", threads: older });
  return groups;
}
