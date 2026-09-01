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
