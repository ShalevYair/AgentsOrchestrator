import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Plan, Stage } from "@ao/shared";
import "../../i18n/index.js";
import { PlanCard } from "./PlanCard.js";

/** UX.md §4's own mockup example: 4 stages, reader×6/analyst×4/writer×3/synthesizer×1, 228K/484K/330K/106K, 1.6M estimate / 2.5M budget. Reusing the doc's own numbers means a mismatch here is a real regression, not a fixture-drift false alarm. */
function buildDemoPlan(overrides: Partial<Stage> = {}): Plan {
  const stages: Stage[] = [
    {
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
    },
    {
      id: "s2",
      name: "ניתוח ממוקד",
      goal: "לנתח",
      dependsOn: ["s1"],
      agentType: "analyst",
      fanout: { mode: "shard", count: 4, maxParallel: 4, shardKey: "module" },
      inputs: [{ from: "blackboard", select: "findings" }],
      outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
      contextBudget: { maxInputTokens: 30000, cacheContract: true },
      tokenBudget: { estimatedIn: 400000, estimatedOut: 84000, hardCap: 600000 },
      mergeStrategy: "local:dedupe-findings",
      successCriteria: ["ok"],
      onFailure: "degrade",
      optional: false,
    },
    {
      id: "s3",
      name: "כתיבת סעיפים",
      goal: "לכתוב",
      dependsOn: ["s2"],
      agentType: "writer",
      fanout: { mode: "shard", count: 3, maxParallel: 3, shardKey: "outline" },
      inputs: [{ from: "blackboard", select: "findings" }],
      outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 12000 },
      contextBudget: { maxInputTokens: 30000, cacheContract: true },
      tokenBudget: { estimatedIn: 270000, estimatedOut: 60000, hardCap: 400000 },
      mergeStrategy: "local:concat-ordered",
      successCriteria: ["ok"],
      onFailure: "degrade",
      optional: false,
    },
    {
      id: "s4",
      name: "סינתזה",
      goal: "לאחד",
      dependsOn: ["s3"],
      agentType: "synthesizer",
      fanout: { mode: "single", count: 1, maxParallel: 1 },
      inputs: [{ from: "blackboard", select: "findings" }],
      outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 16000 },
      contextBudget: { maxInputTokens: 30000, cacheContract: true },
      tokenBudget: { estimatedIn: 80000, estimatedOut: 26000, hardCap: 150000 },
      mergeStrategy: "llm:synthesize",
      successCriteria: ["ok"],
      onFailure: "degrade",
      optional: false,
    },
  ];
  return {
    version: 1,
    runId: "run_demo1234",
    objective: "ניתוח מאגר הקוד וכתיבת מסמך ארכיטקטורה",
    deliverables: [{ id: "d1", kind: "markdown", target: "chat", acceptance: ["ok"] }],
    readPolicy: { maxRung: "R4", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.4, maxFiles: 60 } },
    stages: stages.map((s) => (s.id === "s2" ? { ...s, ...overrides } : s)),
    reserve: { synthesisTokens: 120000, repairTokens: 60000 },
  };
}

describe("PlanCard (UX.md §4)", () => {
  it("collapsed summary shows stage/agent counts and the estimate/budget", () => {
    render(
      <PlanCard
        plan={buildDemoPlan()}
        estimatedTokens={1_600_000}
        budgetTotal={2_500_000}
        amendment={null}
        requiresApproval={false}
      />,
    );
    expect(screen.getByText(/4 שלבים · 14 סוכנים/)).toBeInTheDocument();
    expect(screen.getByText(/צפי 1\.6M \/ 2\.5M/)).toBeInTheDocument();
  });

  // UX.md §9: numbers/identifiers are individually <bdi>-wrapped (not the
  // whole mixed-script line — see PlanCard.tsx's comment on why), so
  // "reader ×6" is several text nodes, not one string. Assert against
  // each stage's <li> (found via its agent-type bdi, which IS one exact
  // text node) with toHaveTextContent, which reads the whole element's
  // concatenated text regardless of how many nodes it's split across.
  function stageRow(agentType: string): HTMLElement {
    const row = screen.getByText(agentType).closest("li");
    if (!row) throw new Error(`no <li> ancestor for agent type "${agentType}"`);
    return row;
  }

  it("expanded (default) shows every stage with agent type, fanout, and token estimate matching UX.md §4's own numbers", () => {
    render(
      <PlanCard
        plan={buildDemoPlan()}
        estimatedTokens={1_600_000}
        budgetTotal={2_500_000}
        amendment={null}
        requiresApproval={false}
      />,
    );
    const reader = stageRow("reader");
    expect(reader).toHaveTextContent("reader ×6");
    expect(reader).toHaveTextContent("shard לפי module");
    expect(reader).toHaveTextContent("3 במקביל");
    expect(reader).toHaveTextContent("228K");

    const analyst = stageRow("analyst");
    expect(analyst).toHaveTextContent("analyst ×4");
    expect(analyst).toHaveTextContent("shard לפי module");
    expect(analyst).toHaveTextContent("484K");

    const writer = stageRow("writer");
    expect(writer).toHaveTextContent("writer ×3");
    expect(writer).toHaveTextContent("shard לפי outline");
    expect(writer).toHaveTextContent("330K");

    const synthesizer = stageRow("synthesizer");
    expect(synthesizer).toHaveTextContent("synthesizer ×1");
    expect(synthesizer).toHaveTextContent("106K");
  });

  it("analyst's maxParallel equals its count, so 'X במקביל' is not shown for it", () => {
    render(
      <PlanCard
        plan={buildDemoPlan()}
        estimatedTokens={1_600_000}
        budgetTotal={2_500_000}
        amendment={null}
        requiresApproval={false}
      />,
    );
    expect(stageRow("analyst")).not.toHaveTextContent("במקביל");
  });

  it("clicking the header collapses the stage list", async () => {
    const user = userEvent.setup();
    render(
      <PlanCard
        plan={buildDemoPlan()}
        estimatedTokens={1_600_000}
        budgetTotal={2_500_000}
        amendment={null}
        requiresApproval={false}
      />,
    );
    expect(screen.getByText("reader")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /תוכנית ריצה/ }));
    expect(screen.queryByText("reader")).not.toBeInTheDocument();
  });

  it("no amendment banner when there is no amendment", () => {
    render(
      <PlanCard
        plan={buildDemoPlan()}
        estimatedTokens={1_600_000}
        budgetTotal={2_500_000}
        amendment={null}
        requiresApproval={false}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the amendment banner with reason, and the diff toggles visibility", async () => {
    const user = userEvent.setup();
    render(
      <PlanCard
        plan={buildDemoPlan({ fanout: { mode: "shard", count: 4, maxParallel: 4, shardKey: "module" } })}
        estimatedTokens={1_600_000}
        budgetTotal={2_500_000}
        amendment={{
          version: 2,
          reason: "המודולים גדולים מהצפוי",
          diff: "replace /stages/1/fanout/count: 8 → 4",
        }}
        requiresApproval={false}
      />,
    );
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("v2");
    expect(banner).toHaveTextContent("המודולים גדולים מהצפוי");
    expect(screen.queryByText(/replace \/stages/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "דיף" }));
    expect(screen.getByText(/replace \/stages\/1\/fanout\/count: 8 → 4/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "הסתר דיף" }));
    expect(screen.queryByText(/replace \/stages/)).not.toBeInTheDocument();
  });

  it("edit/run buttons appear only when requiresApproval is true, and call their callbacks", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onRun = vi.fn();
    const { rerender } = render(
      <PlanCard
        plan={buildDemoPlan()}
        estimatedTokens={1_600_000}
        budgetTotal={2_500_000}
        amendment={null}
        requiresApproval={false}
        onEdit={onEdit}
        onRun={onRun}
      />,
    );
    expect(screen.queryByRole("button", { name: /ערוך/ })).not.toBeInTheDocument();

    rerender(
      <PlanCard
        plan={buildDemoPlan()}
        estimatedTokens={1_600_000}
        budgetTotal={2_500_000}
        amendment={null}
        requiresApproval
        onEdit={onEdit}
        onRun={onRun}
      />,
    );
    await user.click(screen.getByRole("button", { name: /ערוך/ }));
    expect(onEdit).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: /הרץ/ }));
    expect(onRun).toHaveBeenCalledOnce();
  });
});
