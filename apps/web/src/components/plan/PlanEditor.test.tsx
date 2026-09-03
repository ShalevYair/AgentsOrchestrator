import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Plan, Stage } from "@ao/shared";
import "../../i18n/index.js";
import { expectNoAxeViolations } from "../../test/axe.js";
import { PlanEditor } from "./PlanEditor.js";

function buildStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: "s1",
    name: "מיפוי מבנה",
    goal: "לזהות מודולים",
    dependsOn: [],
    agentType: "reader",
    fanout: { mode: "shard", count: 6, maxParallel: 3, shardKey: "module" },
    inputs: [{ from: "artifacts", select: "repoMap" }],
    outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { maxInputTokens: 30000, cacheContract: true },
    tokenBudget: { estimatedIn: 180000, estimatedOut: 48000, hardCap: 300000 },
    mergeStrategy: "local:dedupe-findings",
    successCriteria: ["לפחות ממצא אחד"],
    onFailure: "degrade",
    optional: false,
    ...overrides,
  };
}

function buildPlan(stages: Stage[]): Plan {
  return {
    version: 1,
    runId: "run_test123",
    objective: "ניתוח",
    deliverables: [{ id: "d1", kind: "data", target: "chat", acceptance: ["ok"] }],
    readPolicy: { maxRung: "R4", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages,
    reserve: { synthesisTokens: 120000, repairTokens: 60000 },
  };
}

describe("PlanEditor (UX.md §4 עריכה)", () => {
  it("shows the live estimate and updates it immediately when a stage's agent count changes", async () => {
    const user = userEvent.setup();
    render(
      <PlanEditor
        plan={buildPlan([buildStage()])}
        budgetTotal={2_500_000}
        budgetLevel="standard"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/צפי 228K \/ 2\.5M/)).toBeInTheDocument();

    const stageRow = screen.getByText("מיפוי מבנה").closest("li");
    if (!stageRow) throw new Error("stage row not found");
    const countInput = within(stageRow).getByLabelText("מספר סוכנים");
    await user.clear(countInput);
    await user.type(countInput, "3"); // half the agents -> half the estimate (180K/48K -> 90K/24K = 114K)

    expect(screen.getByText(/צפי 114K \/ 2\.5M/)).toBeInTheDocument();
  });

  it("blocks Save with a real V2 budget-overrun error when scaled up past the budget", async () => {
    const user = userEvent.setup();
    render(
      <PlanEditor
        plan={buildPlan([buildStage()])}
        budgetTotal={500_000}
        budgetLevel="draft"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const stageRow = screen.getByText("מיפוי מבנה").closest("li");
    if (!stageRow) throw new Error("stage row not found");
    const countInput = within(stageRow).getByLabelText("מספר סוכנים");
    await user.clear(countInput);
    await user.type(countInput, "60"); // 10x -> hardCap 300K -> 3M, way past a 500K budget

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "שמור" })).toBeDisabled();
  });

  it("does not call onSave when Save is disabled", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PlanEditor
        plan={buildPlan([buildStage()])}
        budgetTotal={500_000}
        budgetLevel="draft"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    const stageRow = screen.getByText("מיפוי מבנה").closest("li");
    if (!stageRow) throw new Error("stage row not found");
    await user.clear(within(stageRow).getByLabelText("מספר סוכנים"));
    await user.type(within(stageRow).getByLabelText("מספר סוכנים"), "60");
    await user.click(screen.getByRole("button", { name: "שמור" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Save is enabled again once the edit is brought back within budget", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PlanEditor
        plan={buildPlan([buildStage()])}
        budgetTotal={2_500_000}
        budgetLevel="standard"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "שמור" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "שמור" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("cancel calls onCancel without calling onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <PlanEditor
        plan={buildPlan([buildStage()])}
        budgetTotal={2_500_000}
        budgetLevel="standard"
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: "בטל" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("only shows a remove button for optional stages", () => {
    render(
      <PlanEditor
        plan={buildPlan([
          buildStage({ id: "s1", optional: false }),
          buildStage({ id: "s2", name: "שלב אופציונלי", optional: true }),
        ])}
        budgetTotal={2_500_000}
        budgetLevel="standard"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const requiredRow = screen.getByText("מיפוי מבנה").closest("li");
    const optionalRow = screen.getByText("שלב אופציונלי").closest("li");
    if (!requiredRow || !optionalRow) throw new Error("rows not found");
    expect(within(requiredRow).queryByRole("button", { name: "הסר שלב" })).not.toBeInTheDocument();
    expect(within(optionalRow).getByRole("button", { name: "הסר שלב" })).toBeInTheDocument();
  });

  it("removing an optional stage drops it from the list and updates the estimate", async () => {
    const user = userEvent.setup();
    const plan = buildPlan([
      buildStage({ id: "s1" }),
      buildStage({
        id: "s2",
        name: "שלב אופציונלי",
        optional: true,
        dependsOn: ["s1"],
        tokenBudget: { estimatedIn: 10000, estimatedOut: 2000, hardCap: 20000 },
      }),
    ]);
    render(
      <PlanEditor
        plan={plan}
        budgetTotal={2_500_000}
        budgetLevel="standard"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/צפי 240K/)).toBeInTheDocument(); // 228K + 12K

    const optionalRow = screen.getByText("שלב אופציונלי").closest("li");
    if (!optionalRow) throw new Error("row not found");
    await user.click(within(optionalRow).getByRole("button", { name: "הסר שלב" }));

    expect(screen.queryByText("שלב אופציונלי")).not.toBeInTheDocument();
    expect(screen.getByText(/צפי 228K/)).toBeInTheDocument();
  });

  it("disables read-rung options above the budget level's ceiling (draft caps at R4)", () => {
    render(
      <PlanEditor
        plan={buildPlan([buildStage()])}
        budgetTotal={500_000}
        budgetLevel="draft"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const select = screen.getByLabelText("דרגת קריאה מרבית");
    const r5 = within(select).getByRole("option", { name: "R5" });
    const r4 = within(select).getByRole("option", { name: "R4" });
    expect(r5).toBeDisabled();
    expect(r4).not.toBeDisabled();
  });

  it("has no axe violations with the budget-overrun alert and disabled Save shown (P9-T10)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PlanEditor
        plan={buildPlan([buildStage(), buildStage({ id: "s2", name: "שלב אופציונלי", optional: true })])}
        budgetTotal={500_000}
        budgetLevel="draft"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const stageRow = screen.getByText("מיפוי מבנה").closest("li");
    if (!stageRow) throw new Error("stage row not found");
    const countInput = within(stageRow).getByLabelText("מספר סוכנים");
    await user.clear(countInput);
    await user.type(countInput, "60");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await expectNoAxeViolations(container);
  });
});
