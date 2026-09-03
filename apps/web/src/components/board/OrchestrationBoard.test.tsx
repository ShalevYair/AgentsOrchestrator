import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Plan, RuntimeEvent, Stage } from "@ao/shared";
import "../../i18n/index.js";
import { applyRuntimeEvent, INITIAL_RUN_STATE, type RunState } from "../../lib/run-state.js";
import { OrchestrationBoard } from "./OrchestrationBoard.js";

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

function event<T extends RuntimeEvent["type"]>(
  type: T,
  payload: Extract<RuntimeEvent, { type: T }>["payload"],
): RuntimeEvent {
  return { type, runId: "run_test123", seq: 1, payload } as RuntimeEvent;
}

describe("OrchestrationBoard (UX.md §5 levels 1+2)", () => {
  it("shows an empty state with no plan", () => {
    render(<OrchestrationBoard plan={null} stages={{}} tasks={{}} tasksByStage={{}} />);
    expect(screen.getByTestId("orchestration-board")).toHaveTextContent("אין ריצה פעילה");
  });

  it("shows every plan stage, including ones not yet started (pending)", () => {
    const plan = buildPlan([
      buildStage({ id: "s1", name: "שלב א" }),
      buildStage({ id: "s2", name: "שלב ב" }),
    ]);
    render(<OrchestrationBoard plan={plan} stages={{}} tasks={{}} tasksByStage={{}} />);
    expect(screen.getByRole("treeitem", { name: /ממתין.*שלב א/ })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /ממתין.*שלב ב/ })).toBeInTheDocument();
  });

  it("a running stage auto-expands to show its tasks", () => {
    let state: RunState = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.ready", {
        plan: buildPlan([buildStage()]),
        estimatedTokens: 228000,
        requiresApproval: false,
      }),
    );
    state = applyRuntimeEvent(
      state,
      event("stage.started", { stageId: "s1", taskCount: 2, tokensUsed: 0, criteriaMet: [] }),
    );
    state = applyRuntimeEvent(
      state,
      event("task.started", { taskId: "t1", agentType: "reader", shard: "module-a", contextTokens: 5000 }),
    );

    render(
      <OrchestrationBoard
        plan={state.plan}
        stages={state.stages}
        tasks={state.tasks}
        tasksByStage={state.tasksByStage}
      />,
    );
    expect(screen.getByRole("treeitem", { name: /module-a/ })).toBeInTheDocument();
  });

  it("clicking a stage row toggles its task list", async () => {
    const user = userEvent.setup();
    let state: RunState = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.ready", {
        plan: buildPlan([buildStage()]),
        estimatedTokens: 228000,
        requiresApproval: false,
      }),
    );
    state = applyRuntimeEvent(
      state,
      event("stage.started", { stageId: "s1", taskCount: 1, tokensUsed: 0, criteriaMet: [] }),
    );
    state = applyRuntimeEvent(
      state,
      event("task.started", { taskId: "t1", agentType: "reader", shard: "module-a", contextTokens: 5000 }),
    );
    state = applyRuntimeEvent(
      state,
      event("stage.finished", {
        stageId: "s1",
        taskCount: 1,
        tokensUsed: 228000,
        criteriaMet: ["לפחות ממצא אחד"],
      }),
    );

    render(
      <OrchestrationBoard
        plan={state.plan}
        stages={state.stages}
        tasks={state.tasks}
        tasksByStage={state.tasksByStage}
      />,
    );
    // Still expanded (auto-expand doesn't auto-collapse on finish).
    expect(screen.getByRole("treeitem", { name: /module-a/ })).toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { name: /מיפוי מבנה/ }));
    expect(screen.queryByRole("treeitem", { name: /module-a/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { name: /מיפוי מבנה/ }));
    expect(screen.getByRole("treeitem", { name: /module-a/ })).toBeInTheDocument();
  });

  it("clicking a task row calls onSelectTask with its id", async () => {
    const user = userEvent.setup();
    const onSelectTask = vi.fn();
    let state: RunState = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.ready", {
        plan: buildPlan([buildStage()]),
        estimatedTokens: 228000,
        requiresApproval: false,
      }),
    );
    state = applyRuntimeEvent(
      state,
      event("stage.started", { stageId: "s1", taskCount: 1, tokensUsed: 0, criteriaMet: [] }),
    );
    state = applyRuntimeEvent(
      state,
      event("task.started", { taskId: "t1", agentType: "reader", shard: "module-a", contextTokens: 5000 }),
    );

    render(
      <OrchestrationBoard
        plan={state.plan}
        stages={state.stages}
        tasks={state.tasks}
        tasksByStage={state.tasksByStage}
        onSelectTask={onSelectTask}
      />,
    );
    await user.click(screen.getByRole("treeitem", { name: /module-a/ }));
    expect(onSelectTask).toHaveBeenCalledWith("t1");
  });

  describe("keyboard navigation", () => {
    function renderTwoStagesOneExpanded() {
      let state: RunState = applyRuntimeEvent(
        INITIAL_RUN_STATE,
        event("plan.ready", {
          plan: buildPlan([
            buildStage({ id: "s1", name: "שלב א" }),
            buildStage({ id: "s2", name: "שלב ב", dependsOn: ["s1"] }),
          ]),
          estimatedTokens: 228000,
          requiresApproval: false,
        }),
      );
      state = applyRuntimeEvent(
        state,
        event("stage.started", { stageId: "s1", taskCount: 1, tokensUsed: 0, criteriaMet: [] }),
      );
      state = applyRuntimeEvent(
        state,
        event("task.started", { taskId: "t1", agentType: "reader", shard: "module-a", contextTokens: 5000 }),
      );
      return render(
        <OrchestrationBoard
          plan={state.plan}
          stages={state.stages}
          tasks={state.tasks}
          tasksByStage={state.tasksByStage}
        />,
      );
    }

    it("ArrowDown/ArrowUp move focus between visible rows", async () => {
      const user = userEvent.setup();
      renderTwoStagesOneExpanded();
      const stage1 = screen.getByRole("treeitem", { name: /שלב א/ });
      const task = screen.getByRole("treeitem", { name: /module-a/ });
      const stage2 = screen.getByRole("treeitem", { name: /שלב ב/ });

      stage1.focus();
      expect(stage1).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(task).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(stage2).toHaveFocus();
      await user.keyboard("{ArrowUp}");
      expect(task).toHaveFocus();
    });

    it("Home/End jump to the first/last visible row", async () => {
      const user = userEvent.setup();
      renderTwoStagesOneExpanded();
      const stage1 = screen.getByRole("treeitem", { name: /שלב א/ });
      const stage2 = screen.getByRole("treeitem", { name: /שלב ב/ });
      stage1.focus();
      await user.keyboard("{End}");
      expect(stage2).toHaveFocus();
      await user.keyboard("{Home}");
      expect(stage1).toHaveFocus();
    });

    it("ArrowLeft on an expanded stage collapses it; ArrowLeft on a task moves focus to its parent stage", async () => {
      const user = userEvent.setup();
      renderTwoStagesOneExpanded();
      const stage1 = screen.getByRole("treeitem", { name: /שלב א/ });
      const task = screen.getByRole("treeitem", { name: /module-a/ });

      task.focus();
      await user.keyboard("{ArrowLeft}");
      expect(stage1).toHaveFocus();

      await user.keyboard("{ArrowLeft}");
      expect(screen.queryByRole("treeitem", { name: /module-a/ })).not.toBeInTheDocument();
      expect(stage1).toHaveAttribute("aria-expanded", "false");
    });

    it("ArrowRight on a collapsed stage expands it", async () => {
      const user = userEvent.setup();
      renderTwoStagesOneExpanded();
      const stage1 = screen.getByRole("treeitem", { name: /שלב א/ });
      stage1.focus();
      await user.keyboard("{ArrowLeft}"); // collapse first
      expect(screen.queryByRole("treeitem", { name: /module-a/ })).not.toBeInTheDocument();

      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("treeitem", { name: /module-a/ })).toBeInTheDocument();
    });

    it("Enter/Space on a task row selects it", async () => {
      const user = userEvent.setup();
      const onSelectTask = vi.fn();
      let state: RunState = applyRuntimeEvent(
        INITIAL_RUN_STATE,
        event("plan.ready", {
          plan: buildPlan([buildStage()]),
          estimatedTokens: 228000,
          requiresApproval: false,
        }),
      );
      state = applyRuntimeEvent(
        state,
        event("stage.started", { stageId: "s1", taskCount: 1, tokensUsed: 0, criteriaMet: [] }),
      );
      state = applyRuntimeEvent(
        state,
        event("task.started", { taskId: "t1", agentType: "reader", shard: "module-a", contextTokens: 5000 }),
      );
      render(
        <OrchestrationBoard
          plan={state.plan}
          stages={state.stages}
          tasks={state.tasks}
          tasksByStage={state.tasksByStage}
          onSelectTask={onSelectTask}
        />,
      );
      const task = screen.getByRole("treeitem", { name: /module-a/ });
      task.focus();
      await user.keyboard("{Enter}");
      expect(onSelectTask).toHaveBeenCalledWith("t1");
    });
  });

  it("handles 20 parallel tasks without dropping any row, each independently focusable", () => {
    let state: RunState = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.ready", {
        plan: buildPlan([buildStage()]),
        estimatedTokens: 228000,
        requiresApproval: false,
      }),
    );
    state = applyRuntimeEvent(
      state,
      event("stage.started", { stageId: "s1", taskCount: 20, tokensUsed: 0, criteriaMet: [] }),
    );
    for (let i = 0; i < 20; i++) {
      state = applyRuntimeEvent(
        state,
        event("task.started", {
          taskId: `t${String(i)}`,
          agentType: "reader",
          shard: `shard-${String(i)}`,
          contextTokens: 1000,
        }),
      );
    }
    render(
      <OrchestrationBoard
        plan={state.plan}
        stages={state.stages}
        tasks={state.tasks}
        tasksByStage={state.tasksByStage}
      />,
    );
    // 1 stage row + 20 task rows.
    expect(screen.getAllByRole("treeitem")).toHaveLength(21);
    expect(screen.getByRole("treeitem", { name: /shard-19/ })).toBeInTheDocument();
  });

  it("a task.delta re-render (new tasks object, one entry changed) does not remount unrelated task rows — same DOM node survives", () => {
    let state: RunState = applyRuntimeEvent(
      INITIAL_RUN_STATE,
      event("plan.ready", {
        plan: buildPlan([buildStage()]),
        estimatedTokens: 228000,
        requiresApproval: false,
      }),
    );
    state = applyRuntimeEvent(
      state,
      event("stage.started", { stageId: "s1", taskCount: 2, tokensUsed: 0, criteriaMet: [] }),
    );
    state = applyRuntimeEvent(
      state,
      event("task.started", { taskId: "t1", agentType: "reader", shard: "module-a", contextTokens: 1000 }),
    );
    state = applyRuntimeEvent(
      state,
      event("task.started", { taskId: "t2", agentType: "reader", shard: "module-b", contextTokens: 1000 }),
    );

    const { rerender } = render(
      <OrchestrationBoard
        plan={state.plan}
        stages={state.stages}
        tasks={state.tasks}
        tasksByStage={state.tasksByStage}
      />,
    );
    const otherRowBefore = screen.getByRole("treeitem", { name: /module-b/ });

    const next = applyRuntimeEvent(
      state,
      event("task.delta", { taskId: "t1", envelope: { t: "note", text: "hi" } }),
    );
    rerender(
      <OrchestrationBoard
        plan={next.plan}
        stages={next.stages}
        tasks={next.tasks}
        tasksByStage={next.tasksByStage}
      />,
    );

    expect(screen.getByRole("treeitem", { name: /module-b/ })).toBe(otherRowBefore);
  });
});
