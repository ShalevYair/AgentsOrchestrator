import { describe, expect, it, vi } from "vitest";
import { BudgetExceededError, type Usage } from "@ao/shared";
import { admit, runAdmitted } from "./admission.js";
import { Ledger } from "./ledger.js";

function usage(overrides: Partial<Usage> = {}): Usage {
  return { promptTokens: 100, candidatesTokens: 20, thoughtsTokens: 0, cachedTokens: 0, ...overrides };
}

describe("admit — P4-T3, BUDGET.md §4.1", () => {
  it("approves and commits when worstCase fits in available", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const outcome = admit(ledger, { bucket: "execution", stageId: "s1", worstCase: 1000 });
    expect(outcome.decision).toBe("approved");
    expect(ledger.committed).toBe(1000);
  });

  it("rejects when worstCase exceeds available, without mutating the ledger", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const before = ledger.committed;
    const outcome = admit(ledger, { bucket: "execution", stageId: "s1", worstCase: ledger.available + 1 });
    expect(outcome.decision).toBe("rejected");
    expect(ledger.committed).toBe(before);
  });

  it("rejects a negative worstCase", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const outcome = admit(ledger, { bucket: "execution", stageId: "s1", worstCase: -5 });
    expect(outcome.decision).toBe("rejected");
  });
});

describe('runAdmitted — the single sanctioned path to "the provider" (P4-T3\'s done-criterion)', () => {
  it("never calls execute when admission is rejected — proves no path reaches the provider without admit()", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const execute = vi.fn();
    await expect(
      runAdmitted(ledger, { bucket: "execution", stageId: "s1", worstCase: ledger.available + 1 }, execute),
    ).rejects.toThrow(BudgetExceededError);
    expect(execute).not.toHaveBeenCalled();
    expect(ledger.committed).toBe(0);
  });

  it("commits before execute runs, then settles with the real usage on success", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    let committedDuringExecute = 0;
    const result = await runAdmitted(
      ledger,
      { bucket: "execution", stageId: "s1", worstCase: 500 },
      (reservation) => {
        committedDuringExecute = ledger.committed;
        expect(reservation.amount).toBe(500);
        return Promise.resolve({
          usage: usage({ promptTokens: 80, candidatesTokens: 10 }),
          result: "ok" as const,
        });
      },
    );
    expect(result).toBe("ok");
    expect(committedDuringExecute).toBe(500); // reserved BEFORE execute ran
    expect(ledger.committed).toBe(0); // settled after
    expect(ledger.spent).toBe(90);
  });

  it("releases the reservation (no leaked committed) when execute throws", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    await expect(
      runAdmitted(ledger, { bucket: "execution", stageId: "s1", worstCase: 500 }, () => {
        throw new Error("provider call failed");
      }),
    ).rejects.toThrow("provider call failed");
    expect(ledger.committed).toBe(0);
    expect(ledger.spent).toBe(0);
    expect(ledger.openReservationCount).toBe(0);
  });

  it("releases the reservation when execute's returned promise rejects", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    await expect(
      runAdmitted(ledger, { bucket: "execution", stageId: "s1", worstCase: 500 }, () =>
        Promise.reject(new Error("async failure")),
      ),
    ).rejects.toThrow("async failure");
    expect(ledger.committed).toBe(0);
    expect(ledger.openReservationCount).toBe(0);
  });
});
