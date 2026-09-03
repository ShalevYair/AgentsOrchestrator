import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../i18n/index.js";
import { BudgetMeter, type BudgetMeterProps } from "./BudgetMeter.js";

function buildProps(overrides: Partial<BudgetMeterProps> = {}): BudgetMeterProps {
  return {
    spent: 500_000,
    committed: 0,
    remaining: 2_000_000,
    total: 2_500_000,
    byStage: {},
    projection: null,
    overrunPolicy: "degrade",
    ...overrides,
  };
}

describe("BudgetMeter (UX.md §1 + BUDGET.md §8)", () => {
  it("the chip shows spent/total", () => {
    render(<BudgetMeter {...buildProps({ spent: 500_000, total: 2_500_000 })} />);
    expect(screen.getByRole("button", { name: /500K/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2\.5M/ })).toBeInTheDocument();
  });

  it("clicking the chip opens a dialog with spent/committed/remaining", async () => {
    const user = userEvent.setup();
    render(<BudgetMeter {...buildProps({ spent: 500_000, committed: 100_000, remaining: 1_900_000 })} />);
    await user.click(screen.getByRole("button", { name: /500K/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("500K");
    expect(dialog).toHaveTextContent("100K");
    expect(dialog).toHaveTextContent("1.9M");
  });

  it("shows 'no projection' text when projection is null (no real signal yet)", async () => {
    const user = userEvent.setup();
    render(<BudgetMeter {...buildProps({ projection: null })} />);
    await user.click(screen.getByRole("button", { name: /500K/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("עדיין אין מספיק נתונים לצפי");
  });

  it("shows the real projected total when one exists", async () => {
    const user = userEvent.setup();
    render(<BudgetMeter {...buildProps({ projection: 1_800_000 })} />);
    await user.click(screen.getByRole("button", { name: /500K/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("1.8M");
  });

  it("renders a per-stage breakdown when byStage has entries", async () => {
    const user = userEvent.setup();
    render(<BudgetMeter {...buildProps({ byStage: { s1: 300_000, s2: 200_000 } })} />);
    await user.click(screen.getByRole("button", { name: /500K/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("s1");
    expect(dialog).toHaveTextContent("300K");
    expect(dialog).toHaveTextContent("s2");
    expect(dialog).toHaveTextContent("200K");
  });

  it("omits the per-stage section entirely when byStage is empty", async () => {
    const user = userEvent.setup();
    render(<BudgetMeter {...buildProps({ byStage: {} })} />);
    await user.click(screen.getByRole("button", { name: /500K/ }));
    expect(screen.queryByText("לפי שלב")).not.toBeInTheDocument();
  });

  it("under 75% shows no warning/danger note", async () => {
    const user = userEvent.setup();
    render(<BudgetMeter {...buildProps({ spent: 700_000, committed: 0, total: 1_000_000 })} />);
    await user.click(screen.getByRole("button", { name: /700K/ }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("at 75%+ shows the warning note with the real overrun policy", async () => {
    const user = userEvent.setup();
    render(
      <BudgetMeter
        {...buildProps({ spent: 800_000, committed: 0, total: 1_000_000, overrunPolicy: "ask" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: /800K/ }));
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("מתקרב לתקציב");
    expect(note).toHaveTextContent("שאל אותי");
  });

  it("at 90%+ shows the danger note with the real overrun policy", async () => {
    const user = userEvent.setup();
    render(
      <BudgetMeter
        {...buildProps({ spent: 950_000, committed: 0, total: 1_000_000, overrunPolicy: "hard-stop" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: /950K/ }));
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("קרוב מאוד לתקציב");
    expect(note).toHaveTextContent("עצור");
  });

  it("counts committed tokens toward the severity threshold, not just spent", async () => {
    const user = userEvent.setup();
    // 500K spent + 450K committed = 95% of 1M -> danger, despite spent alone being only 50%.
    render(<BudgetMeter {...buildProps({ spent: 500_000, committed: 450_000, total: 1_000_000 })} />);
    await user.click(screen.getByRole("button", { name: /500K/ }));
    expect(screen.getByRole("status")).toHaveTextContent("קרוב מאוד לתקציב");
  });
});
