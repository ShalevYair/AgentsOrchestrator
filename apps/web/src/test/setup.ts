import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// vitest.config.ts doesn't enable `test.globals`, so React Testing
// Library's own auto-cleanup (which only registers itself when it detects
// a global `afterEach`) never fires on its own — wire it up explicitly so
// each test starts from an empty document instead of accumulating
// previous tests' rendered trees.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement scrollIntoView at all (it depends on layout,
// which jsdom doesn't do) — real browsers all have it. MessageList.tsx
// calls it on every render to keep the chat scrolled to the latest
// message; without this stub, any test that renders it throws inside a
// passive effect and React unmounts the whole tree.
// eslint-disable-next-line @typescript-eslint/unbound-method -- reading the current value to polyfill it, never calling it unbound
Element.prototype.scrollIntoView ??= function scrollIntoViewStub(): void {
  return;
};
