import * as React from "react";
import { useTranslation } from "react-i18next";
import type { Fanout, Plan } from "@ao/shared";
import { Card } from "../ui/card.js";
import { Button } from "../ui/button.js";
import { formatTokenCount } from "../../lib/cost.js";
import type { PlanAmendment } from "../../lib/run-state.js";

export interface PlanCardProps {
  plan: Plan;
  estimatedTokens: number;
  budgetTotal: number;
  amendment: PlanAmendment | null;
  requiresApproval: boolean;
  onEdit?: () => void;
  onRun?: () => void;
}

/**
 * Stage-level fanout description ("shard לפי module · 3 במקביל · 228K").
 * UX.md §9: code/paths/ids/numbers are always LTR, individually wrapped in
 * `<bdi>` — NOT the composite Hebrew+English line as a whole. A single
 * `<bdi>` (or `dir="auto"`) around a whole mixed-script line lets its
 * auto-detected base direction (decided by whichever script's first
 * strong character happens to come first) reorder *every* run inside it,
 * which can visibly scramble a short English identifier sitting next to a
 * Hebrew connector word — verified by hand in a Chromium harness while
 * building this: wrapping the whole line broke "3 במקביל · 228K" into
 * "3 228 במקבילK". Isolating only the true LTR atoms (mode, shardKey,
 * numbers, the token count) and leaving the Hebrew connector words
 * ("לפי"/"במקביל") as plain text in the ambient RTL flow renders correctly
 * instead. UX.md §4's mockup shows the shardKey callout ("shard לפי שלד")
 * on only one of its four example stages despite two being shard mode
 * with a shardKey set — read as illustrative shorthand, not a literal
 * per-stage rule, so this always shows the shardKey when the plan
 * actually has one: more information, consistently, beats reproducing the
 * mockup's own inconsistency.
 */
function FanoutDescription({
  fanout,
  totalTokens,
}: {
  fanout: Fanout;
  totalTokens: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      {fanout.mode !== "single" && (
        <>
          {" · "}
          <bdi>{fanout.mode}</bdi>
          {fanout.mode === "shard" && fanout.shardKey && (
            <>
              {" "}
              {t("plan.fanoutBy")} <bdi>{fanout.shardKey}</bdi>
            </>
          )}
        </>
      )}
      {fanout.maxParallel < fanout.count && (
        <>
          {" · "}
          <bdi>{fanout.maxParallel}</bdi> {t("plan.parallelSuffix")}
        </>
      )}
      {" · "}
      <bdi>{formatTokenCount(totalTokens)}</bdi>
    </>
  );
}

export function PlanCard({
  plan,
  estimatedTokens,
  budgetTotal,
  amendment,
  requiresApproval,
  onEdit,
  onRun,
}: PlanCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(true);
  const [diffOpen, setDiffOpen] = React.useState(false);
  const totalAgents = plan.stages.reduce((sum, stage) => sum + stage.fanout.count, 0);

  return (
    <Card className="max-w-xl" data-testid="plan-card">
      <button
        type="button"
        onClick={() => {
          setExpanded((prev) => !prev);
        }}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 p-4 text-start"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true">🗺️</span> {t("plan.title")}
        </span>
        <bdi className="text-xs text-neutral-500 dark:text-neutral-400">v{plan.version}</bdi>
      </button>
      <div className="px-4 pb-3 text-xs text-neutral-500 dark:text-neutral-400">
        <bdi>
          {t("plan.summary", { stageCount: plan.stages.length, agentCount: totalAgents })} ·{" "}
          {t("plan.estimate", {
            estimate: formatTokenCount(estimatedTokens),
            budget: formatTokenCount(budgetTotal),
          })}
        </bdi>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <ol className="flex flex-col gap-2">
            {plan.stages.map((stage, index) => {
              const totalTokens = stage.tokenBudget.estimatedIn + stage.tokenBudget.estimatedOut;
              return (
                <li key={stage.id} className="text-sm">
                  <div>
                    <bdi>{index + 1}</bdi> {stage.name}
                  </div>
                  <div className="ps-4 text-xs text-neutral-500 dark:text-neutral-400">
                    <span aria-hidden="true">🤖</span> <bdi>{stage.agentType}</bdi> ×
                    <bdi>{stage.fanout.count}</bdi>
                    <FanoutDescription fanout={stage.fanout} totalTokens={totalTokens} />
                  </div>
                </li>
              );
            })}
          </ol>

          {amendment && (
            <div
              role="status"
              className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              <div>
                <span aria-hidden="true">⚠️</span>{" "}
                {t("plan.amendedBanner", { version: amendment.version, reason: amendment.reason })}
              </div>
              <button
                type="button"
                className="mt-1 font-medium underline"
                onClick={() => {
                  setDiffOpen((prev) => !prev);
                }}
                aria-expanded={diffOpen}
              >
                {diffOpen ? t("plan.hideDiff") : t("plan.showDiff")}
              </button>
              {diffOpen && (
                <pre
                  dir="ltr"
                  className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-black/5 p-2 text-start dark:bg-white/5"
                >
                  {amendment.diff}
                </pre>
              )}
            </div>
          )}

          {requiresApproval && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                <span aria-hidden="true">✏️</span> {t("plan.edit")}
              </Button>
              <Button size="sm" onClick={onRun}>
                <span aria-hidden="true">✅</span> {t("plan.run")}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
