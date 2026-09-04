import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import type { Thread } from "./api.js";
import { groupThreadsByDate } from "./thread-groups.js";

// A fixed "now" (2026-03-15 14:30 local) rather than the real clock, so
// every boundary case below is deterministic regardless of when/where the
// test runs.
const NOW = new Date(2026, 2, 15, 14, 30, 0);

function thread(id: string, updatedAt: string): Thread {
  return { id, title: id, createdAt: updatedAt, updatedAt, goalConfig: DEFAULT_GOAL_CONFIG };
}

describe("groupThreadsByDate", () => {
  it("returns no groups at all for an empty list", () => {
    expect(groupThreadsByDate([], NOW)).toEqual([]);
  });

  it("buckets a thread updated a minute ago into today", () => {
    const t = thread("a", new Date(2026, 2, 15, 14, 29, 0).toISOString());
    expect(groupThreadsByDate([t], NOW)).toEqual([{ label: "today", threads: [t] }]);
  });

  it("buckets a thread updated yesterday afternoon into yesterday", () => {
    const t = thread("a", new Date(2026, 2, 14, 14, 30, 0).toISOString());
    expect(groupThreadsByDate([t], NOW)).toEqual([{ label: "yesterday", threads: [t] }]);
  });

  it("buckets a thread updated last week into older", () => {
    const t = thread("a", new Date(2026, 2, 5, 12, 0, 0).toISOString());
    expect(groupThreadsByDate([t], NOW)).toEqual([{ label: "older", threads: [t] }]);
  });

  it("a thread updated at exactly the start of today counts as today, not yesterday", () => {
    const t = thread("a", new Date(2026, 2, 15, 0, 0, 0, 0).toISOString());
    expect(groupThreadsByDate([t], NOW)).toEqual([{ label: "today", threads: [t] }]);
  });

  it("a thread updated 1ms before the start of today counts as yesterday", () => {
    const t = thread("a", new Date(2026, 2, 14, 23, 59, 59, 999).toISOString());
    expect(groupThreadsByDate([t], NOW)).toEqual([{ label: "yesterday", threads: [t] }]);
  });

  it("omits empty groups instead of rendering them blank", () => {
    const t = thread("a", new Date(2026, 2, 5, 12, 0, 0).toISOString());
    const groups = groupThreadsByDate([t], NOW);
    expect(groups.map((g) => g.label)).toEqual(["older"]);
  });

  it("orders groups today, yesterday, older and preserves within-group order", () => {
    const today1 = thread("today-1", new Date(2026, 2, 15, 13, 0, 0).toISOString());
    const today2 = thread("today-2", new Date(2026, 2, 15, 9, 0, 0).toISOString());
    const yest = thread("yest-1", new Date(2026, 2, 14, 10, 0, 0).toISOString());
    const old = thread("old-1", new Date(2026, 1, 1, 10, 0, 0).toISOString());

    // Passed in already-sorted (newest first), same as api.listThreads().
    const groups = groupThreadsByDate([today1, today2, yest, old], NOW);

    expect(groups).toEqual([
      { label: "today", threads: [today1, today2] },
      { label: "yesterday", threads: [yest] },
      { label: "older", threads: [old] },
    ]);
  });

  it("a malformed updatedAt falls back to older rather than throwing", () => {
    const t = thread("bad", "not-a-date");
    expect(() => groupThreadsByDate([t], NOW)).not.toThrow();
    expect(groupThreadsByDate([t], NOW)).toEqual([{ label: "older", threads: [t] }]);
  });

  it("defaults `now` to the real current time when omitted", () => {
    const t = thread("a", new Date().toISOString());
    expect(groupThreadsByDate([t])).toEqual([{ label: "today", threads: [t] }]);
  });
});
