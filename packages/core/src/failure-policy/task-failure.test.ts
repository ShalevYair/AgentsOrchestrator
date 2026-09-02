import { describe, expect, it } from "vitest";
import { nextTaskFailureAction } from "./task-failure.js";

describe("nextTaskFailureAction", () => {
  it("retries with reduced context on the first failure", () => {
    expect(nextTaskFailureAction(0)).toBe("retry-with-reduced-context");
  });

  it("reallocates on the second failure", () => {
    expect(nextTaskFailureAction(1)).toBe("reallocate");
  });

  it("skips (with a recorded gap, by the caller) from the third failure onward", () => {
    expect(nextTaskFailureAction(2)).toBe("skip");
    expect(nextTaskFailureAction(10)).toBe("skip");
  });
});
