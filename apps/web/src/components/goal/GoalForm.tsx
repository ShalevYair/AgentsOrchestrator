import * as React from "react";
import { useTranslation } from "react-i18next";
import type { BudgetLevel, GoalConfig, OverrunPolicy, ThinkingLevel } from "@ao/shared";
import {
  BUDGET_LEVEL_BLOCKS_ENSEMBLE,
  BUDGET_LEVEL_MAX_PARALLEL,
  BUDGET_LEVEL_MAX_RUNG,
  BUDGET_LEVEL_TOKENS,
  estimateCostUsd,
  formatTokenCount,
  formatUsd,
} from "../../lib/cost.js";
import { cn } from "../../lib/utils.js";
import { NumericField } from "../ui/numeric-field.js";

export interface GoalFormProps {
  value: GoalConfig;
  onChange: (next: GoalConfig) => void;
}

const FIXED_LEVELS: readonly Exclude<BudgetLevel, "custom">[] = ["draft", "standard", "deep"];
const ALL_LEVELS: readonly BudgetLevel[] = [...FIXED_LEVELS, "custom"];
const LEVEL_ICON: Readonly<Record<BudgetLevel, string>> = {
  draft: "✏️",
  standard: "⚖️",
  deep: "🔬",
  custom: "⚙️",
};
const EFFORT_LEVELS: readonly ThinkingLevel[] = ["low", "medium", "high"];
const OVERRUN_POLICIES: readonly OverrunPolicy[] = ["degrade", "ask", "hard-stop"];

const RADIO_ROW = "flex items-start gap-2 rounded-md p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800";
const SECTION_TITLE = "text-xs font-semibold text-neutral-500 dark:text-neutral-400";

/**
 * UX.md §3's goal-button form, in full. Every field lives directly on
 * `value`/`onChange` (no internal state) — the caller (GoalButton) owns
 * persistence, this component only ever renders `value` and asks for the
 * next one.
 */
export function GoalForm({ value, onChange }: GoalFormProps): React.JSX.Element {
  const { t } = useTranslation();

  function selectLevel(level: BudgetLevel): void {
    if (level === "custom") {
      onChange({
        ...value,
        level,
        maxParallel: BUDGET_LEVEL_MAX_PARALLEL.standard,
      });
      return;
    }
    onChange({
      ...value,
      level,
      budgetTotal: BUDGET_LEVEL_TOKENS[level],
      maxParallel: BUDGET_LEVEL_MAX_PARALLEL[level],
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-1">
        <legend className={SECTION_TITLE}>{t("goal.budgetSection")}</legend>
        {ALL_LEVELS.map((level) => {
          const tokens = level === "custom" ? value.budgetTotal : BUDGET_LEVEL_TOKENS[level];
          const cost = estimateCostUsd(tokens);
          const inputId = `goal-level-${level}`;
          return (
            <div key={level} className={RADIO_ROW}>
              <input
                id={inputId}
                type="radio"
                name="goal-level"
                className="mt-1"
                checked={value.level === level}
                onChange={() => {
                  selectLevel(level);
                }}
              />
              <div className="flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <label htmlFor={inputId} className="cursor-pointer">
                    <span aria-hidden="true">{LEVEL_ICON[level]}</span> {t(`goal.levels.${level}`)}
                  </label>
                  <bdi className="text-neutral-500 dark:text-neutral-400">
                    {level === "custom" ? (
                      <NumericField
                        min={1}
                        step={1000}
                        value={value.budgetTotal}
                        onFocus={() => {
                          if (value.level !== "custom") selectLevel("custom");
                        }}
                        onCommit={(budgetTotal) => {
                          onChange({ ...value, level: "custom", budgetTotal });
                        }}
                        className="h-7 w-28 text-end"
                        aria-label={t("goal.customBudgetLabel")}
                      />
                    ) : (
                      <label htmlFor={inputId} className="cursor-pointer">
                        {formatTokenCount(tokens)}
                        {cost !== null && <> · ≈{formatUsd(cost)}</>}
                      </label>
                    )}
                  </bdi>
                </div>
                <label
                  htmlFor={inputId}
                  className="cursor-pointer text-xs text-neutral-500 dark:text-neutral-400"
                >
                  {t(`goal.levelHint.${level}`)}
                </label>
                {level !== "custom" && (
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">
                    {t("goal.derivedLimits", {
                      rung: BUDGET_LEVEL_MAX_RUNG[level],
                      ensemble: t(
                        BUDGET_LEVEL_BLOCKS_ENSEMBLE[level] ? "goal.ensembleBlocked" : "goal.ensembleAllowed",
                      ),
                      maxParallel: BUDGET_LEVEL_MAX_PARALLEL[level],
                    })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className={SECTION_TITLE}>{t("goal.effortSection")}</legend>
        <div className="flex gap-3">
          {EFFORT_LEVELS.map((effort) => (
            <label key={effort} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="goal-effort"
                checked={value.effort === effort}
                onChange={() => {
                  onChange({ ...value, effort });
                }}
              />
              {t(`goal.effort.${effort}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className={SECTION_TITLE}>{t("goal.overrunSection")}</legend>
        {OVERRUN_POLICIES.map((policy) => (
          <label key={policy} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="goal-overrun"
              checked={value.overrunPolicy === policy}
              onChange={() => {
                onChange({ ...value, overrunPolicy: policy });
              }}
            />
            {t(`goal.overrun.${policy}`)}
          </label>
        ))}
      </fieldset>

      <details className="group">
        <summary className={cn(SECTION_TITLE, "cursor-pointer select-none list-none")}>
          <span className="inline-block transition-transform group-open:rotate-90">▸</span>{" "}
          {t("goal.advanced")}
        </summary>
        <div className="mt-2 flex flex-col gap-3 ps-1">
          <label className="flex items-center justify-between gap-2 text-sm">
            {t("goal.maxParallelLabel")}
            <NumericField
              min={1}
              step={1}
              value={value.maxParallel}
              onCommit={(maxParallel) => {
                onChange({ ...value, maxParallel });
              }}
              className="h-7 w-20 text-end"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.allowScripts}
              onChange={(e) => {
                onChange({ ...value, allowScripts: e.target.checked });
              }}
            />
            {t("goal.allowScripts")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.allowFolderWrite}
              onChange={(e) => {
                onChange({ ...value, allowFolderWrite: e.target.checked });
              }}
            />
            {t("goal.allowFolderWrite")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.requirePlanApproval}
              onChange={(e) => {
                onChange({ ...value, requirePlanApproval: e.target.checked });
              }}
            />
            {t("goal.requirePlanApproval")}
          </label>
        </div>
      </details>
    </div>
  );
}

export { LEVEL_ICON };
