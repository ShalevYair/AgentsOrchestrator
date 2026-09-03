import { expect } from "vitest";
import axe from "axe-core";

/**
 * UX.md §9 / P9-T10's "axe נקי" bar. `color-contrast` (and a few other
 * rules that need real layout/paint) can't run meaningfully under jsdom —
 * jsdom has no canvas/layout engine, so axe-core itself skips them as
 * "incomplete" rather than failing; those are verified separately against
 * a real Chromium render (see docs/TASKS.md's P9-T10 note), not here.
 * `region` ("content must be contained by a landmark") is a *page*-level
 * check — every one-off component render here is a fragment mounted
 * directly under `document.body`, never inside the real `<header>`/`<main>`
 * App.tsx actually wraps it in, so it would always fire regardless of the
 * component; checked for real once, at the whole-App level, in
 * App.test.tsx instead. Structural rules that *do* mean something at
 * component granularity — labels, roles, ARIA validity — run for real.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  expect(results.violations).toEqual([]);
}
