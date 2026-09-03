import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Stage } from "@ao/shared";
import "../../i18n/index.js";
import type { TaskState } from "../../lib/run-state.js";
import { TaskDrawer } from "./TaskDrawer.js";

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

function buildTask(overrides: Partial<TaskState> = {}): TaskState {
  return {
    taskId: "t1",
    stageId: "s1",
    agentType: "reader",
    shard: "module-a",
    status: "running",
    contextTokens: 5000,
    startedAt: 1_000,
    finishedAt: null,
    usage: null,
    finishReason: null,
    violations: null,
    deltas: [],
    ...overrides,
  };
}

describe("TaskDrawer (UX.md §5 level 3)", () => {
  it("renders nothing when there's no task", () => {
    const { container } = render(<TaskDrawer task={null} stage={null} open={false} onOpenChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the shard name, agent type, and status in the header", () => {
    render(
      <TaskDrawer
        task={buildTask({ shard: "module-b", agentType: "analyst" })}
        stage={null}
        open
        onOpenChange={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("module-b");
    expect(dialog).toHaveTextContent("analyst");
    expect(dialog).toHaveTextContent("פועל");
  });

  it("context section shows the task's contextTokens even with no stage loaded", () => {
    render(
      <TaskDrawer task={buildTask({ contextTokens: 42_000 })} stage={null} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("42K");
  });

  it("context section shows the stage's real contract/budget/inputs when the stage is loaded", () => {
    const stage = buildStage({
      contextBudget: { maxInputTokens: 30_000, cacheContract: true },
      outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8_000 },
      inputs: [{ from: "artifacts", select: "repoMap" }],
    });
    render(<TaskDrawer task={buildTask()} stage={stage} open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("30K");
    expect(dialog).toHaveTextContent("FindingList");
    expect(dialog).toHaveTextContent("8K");
    expect(dialog).toHaveTextContent("artifacts");
    expect(dialog).toHaveTextContent("repoMap");
  });

  it("output section shows a placeholder before any delta arrives", () => {
    render(<TaskDrawer task={buildTask({ deltas: [] })} stage={null} open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("עדיין אין פלט");
  });

  it("output section renders real parsed envelopes by type", () => {
    const task = buildTask({
      deltas: [
        { t: "note", text: "בודק תלויות" },
        {
          t: "finding",
          id: "f1",
          claim: "יש תלות מעגלית",
          tags: ["arch"],
          evidence: [{ artifact: "a1", loc: "L1" }],
          confidence: 0.8,
        },
        {
          t: "done",
          summary: "סיימתי",
          selfCheck: { criteriaMet: ["a"], unmet: [], confidence: 0.9 },
        },
      ],
    });
    render(<TaskDrawer task={task} stage={null} open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("בודק תלויות");
    expect(dialog).toHaveTextContent("יש תלות מעגלית");
    expect(dialog).toHaveTextContent("80%");
    expect(dialog).toHaveTextContent("סיימתי");
  });

  it("usage section shows real usage/finishReason/violations for a finished task", () => {
    const task = buildTask({
      status: "done",
      finishedAt: 4_000,
      usage: { promptTokens: 5_000, candidatesTokens: 1_200, thoughtsTokens: 300, cachedTokens: 800 },
      finishReason: "stop",
      violations: 0,
    });
    render(<TaskDrawer task={task} stage={null} open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("5K");
    expect(dialog).toHaveTextContent("1.2K");
    expect(dialog).toHaveTextContent("800");
    expect(dialog).toHaveTextContent("stop");
  });

  it("'copy prompt' is disabled — the runtime doesn't send prompt text over the wire", () => {
    render(<TaskDrawer task={buildTask()} stage={null} open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "העתקת הפרומפט" })).toBeDisabled();
  });

  it("'rerun' is disabled with no onRerun handler, enabled and wired when one is passed", async () => {
    const user = userEvent.setup();
    const onRerun = vi.fn();
    const { rerender } = render(
      <TaskDrawer task={buildTask({ taskId: "t9" })} stage={null} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "הרצה חוזרת" })).toBeDisabled();

    rerender(
      <TaskDrawer
        task={buildTask({ taskId: "t9" })}
        stage={null}
        open
        onOpenChange={vi.fn()}
        onRerun={onRerun}
      />,
    );
    const rerunButton = screen.getByRole("button", { name: "הרצה חוזרת" });
    expect(rerunButton).not.toBeDisabled();
    await user.click(rerunButton);
    expect(onRerun).toHaveBeenCalledWith("t9");
  });

  describe("export JSON", () => {
    let clickSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => "blob:mock-url");
      URL.revokeObjectURL = vi.fn();
      clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("downloads the real TaskState as JSON, named by taskId", async () => {
      const user = userEvent.setup();
      let capturedParts: BlobPart[] | undefined;
      const RealBlob = globalThis.Blob;
      class CapturingBlob extends RealBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          capturedParts = parts;
        }
      }
      vi.stubGlobal("Blob", CapturingBlob);

      const task = buildTask({ taskId: "t42", shard: "module-z" });
      render(<TaskDrawer task={task} stage={null} open onOpenChange={vi.fn()} />);
      await user.click(screen.getByRole("button", { name: "ייצוא JSON" }));

      expect(capturedParts).toBeDefined();
      const parsed = JSON.parse(capturedParts![0] as string) as TaskState;
      expect(parsed.taskId).toBe("t42");
      expect(parsed.shard).toBe("module-z");
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("closing the drawer (Escape) calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TaskDrawer task={buildTask()} stage={null} open onOpenChange={onOpenChange} />);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
