import * as React from "react";
import { useTranslation } from "react-i18next";
import { rungIndex } from "@ao/core/plan";
import { ReadRungSchema, type BudgetLevel, type Plan, type ReadRung } from "@ao/shared";
import { Button } from "../ui/button.js";
import { NumericField } from "../ui/numeric-field.js";
import { BUDGET_LEVEL_MAX_RUNG, formatTokenCount } from "../../lib/cost.js";
import {
  removeOptionalStage,
  replaceStage,
  scaleStageCount,
  setMaxRung,
  setStageMaxParallel,
  sumPlanEstimatedTokens,
} from "../../lib/plan-edit.js";
import { validateEditedPlan } from "../../lib/plan-validation.js";

export interface PlanEditorProps {
  plan: Plan;
  budgetTotal: number;
  budgetLevel: BudgetLevel;
  onSave: (plan: Plan) => void;
  onCancel: () => void;
}

const READ_RUNGS = ReadRungSchema.options;

/**
 * UX.md §4's "עריכה": agent count, concurrency, read rung, removing
 * optional stages — with the cost projection and budget-overrun block
 * both driven by the *same* real functions the rest of the app uses
 * (packages/core/src/plan/validate.ts's validatePlan via
 * lib/plan-validation.ts), never a second, UI-only guess at the rules.
 */
export function PlanEditor({
  plan,
  budgetTotal,
  budgetLevel,
  onSave,
  onCancel,
}: PlanEditorProps): React.JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = React.useState(plan);

  const validation = React.useMemo(
    () => validateEditedPlan(draft, budgetTotal, budgetLevel),
    [draft, budgetTotal, budgetLevel],
  );
  const estimatedTokens = React.useMemo(() => sumPlanEstimatedTokens(draft), [draft]);
  const maxRungCeilingIndex = rungIndex(BUDGET_LEVEL_MAX_RUNG[budgetLevel]);

  function updateStage(
    stageId: string,
    next: (stage: Plan["stages"][number]) => Plan["stages"][number],
  ): void {
    setDraft((current) => {
      const stage = current.stages.find((s) => s.id === stageId);
      return stage ? replaceStage(current, stageId, next(stage)) : current;
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="plan-editor">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        <bdi>
          {t("plan.estimate", {
            estimate: formatTokenCount(estimatedTokens),
            budget: formatTokenCount(budgetTotal),
          })}
        </bdi>
      </div>

      <label className="flex items-center justify-between gap-2 text-sm">
        {t("plan.maxRungLabel")}
        <select
          value={draft.readPolicy.maxRung}
          onChange={(e) => {
            setDraft((current) => setMaxRung(current, e.target.value as ReadRung));
          }}
          className="h-8 rounded-md border border-neutral-300 bg-transparent px-2 text-sm dark:border-neutral-700"
        >
          {READ_RUNGS.map((rung) => (
            <option key={rung} value={rung} disabled={rungIndex(rung) > maxRungCeilingIndex}>
              {rung}
            </option>
          ))}
        </select>
      </label>

      <ol className="flex flex-col gap-2">
        {draft.stages.map((stage, index) => (
          <li
            key={stage.id}
            className="flex flex-col gap-1 rounded-md border border-neutral-200 p-2 dark:border-neutral-800"
          >
            <div className="text-sm">
              <bdi>{index + 1}</bdi> {stage.name}
            </div>
            <label className="flex items-center justify-between gap-2 text-xs">
              {t("plan.agentCountLabel")}
              <NumericField
                value={stage.fanout.count}
                min={1}
                onCommit={(count) => {
                  updateStage(stage.id, (s) => scaleStageCount(s, count));
                }}
                className="h-7 w-20 text-end"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">
              {t("plan.maxParallelLabel")}
              <NumericField
                value={stage.fanout.maxParallel}
                min={1}
                onCommit={(maxParallel) => {
                  updateStage(stage.id, (s) => setStageMaxParallel(s, maxParallel));
                }}
                className="h-7 w-20 text-end"
              />
            </label>
            {stage.optional && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft((current) => removeOptionalStage(current, stage.id));
                }}
              >
                {t("plan.removeStage")}
              </Button>
            )}
          </li>
        ))}
      </ol>

      {!validation.valid && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <div className="font-medium">{t("plan.validationErrors")}</div>
          <ul className="list-inside list-disc">
            {validation.issues.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t("plan.cancel")}
        </Button>
        <Button
          size="sm"
          disabled={!validation.valid}
          onClick={() => {
            onSave(draft);
          }}
        >
          {t("plan.save")}
        </Button>
      </div>
    </div>
  );
}
