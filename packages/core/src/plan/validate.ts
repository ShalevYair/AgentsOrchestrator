import { PlanSchema, type BudgetLevel, type Plan, type ReadRung } from "@ao/shared";
import {
  BUDGET_LEVEL_BLOCKS_ENSEMBLE,
  BUDGET_LEVEL_MAX_PARALLEL,
  BUDGET_LEVEL_MAX_RUNG,
  DELIVERABLE_KIND_AGENT_TYPES,
  rungIndex,
} from "./types.js";

export type PlanValidationCode = "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9";

export interface PlanValidationIssue {
  code: PlanValidationCode;
  message: string;
  /** JSON-pointer-ish path for UI display, e.g. "/stages/2/fanout/count". Best-effort, not guaranteed to resolve. */
  path?: string;
}

export interface PlanValidationResult {
  valid: boolean;
  issues: PlanValidationIssue[];
  /** Present only when `valid` is true — the parsed, schema-checked Plan. */
  plan?: Plan;
}

export interface PlanValidationContext {
  /** `budget.total` from the goal button (BUDGET.md §1) — the Plan document itself carries no total, see plan.ts's own comment. */
  budgetTotal: number;
  budgetLevel: BudgetLevel;
  /** The agent registry's known `type` values (PROTOCOLS.md §10) — V3. */
  knownAgentTypes: ReadonlySet<string>;
  /** The active model's real output ceiling (e.g. 64000 for gemini-3.7-flash) — V4. `core` has no provider, so this is always injected by the caller. */
  modelMaxOutputTokens: number;
  /** Overrides BUDGET_LEVEL_MAX_PARALLEL for this run when set — otherwise the per-level default applies (undefined for "custom" means no ceiling is enforced). */
  globalMaxParallel?: number;
  /** Optional ceiling on a single stage's fanout.count, independent of maxParallel. Undefined = no ceiling. */
  globalMaxFanoutCount?: number;
  /**
   * The reducer registry's known ids (P10-T6's `createReducerRegistry`,
   * packages/core/reducers/registry.ts) — V9. The exact same split V3
   * already draws for `agentType`/`knownAgentTypes`: `Stage.mergeStrategy`
   * is just a non-empty string at the schema level (`ReducerIdSchema`,
   * `@ao/shared`) so a custom reducer can register under any id without
   * touching that schema; this is what actually catches an unknown one at
   * plan-validation time. Undefined = skip the check (existing callers
   * that don't yet pass a registry aren't broken by V9's addition).
   */
  knownReducerIds?: ReadonlySet<string>;
}

/** V4's safety margin (PROTOCOLS.md §1: "מרווח ביטחון 10%") — a stage's maxOutputTokens must leave this much headroom under the model's real ceiling. */
const V4_SAFETY_MARGIN = 0.1;

const STATIC_INPUT_SOURCES = new Set(["artifacts", "blackboard"]);

function issue(code: PlanValidationCode, message: string, path?: string): PlanValidationIssue {
  return path !== undefined ? { code, message, path } : { code, message };
}

/**
 * V1 — schema validity plus DAG well-formedness: stage ids unique, every
 * `dependsOn` entry resolves to a known stage id, and the dependency graph
 * has no cycles. Detected via a standard three-color DFS.
 */
export function validateV1(plan: Plan): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  const stageIds = new Set<string>();
  const duplicates = new Set<string>();
  for (const stage of plan.stages) {
    if (stageIds.has(stage.id)) duplicates.add(stage.id);
    stageIds.add(stage.id);
  }
  for (const id of duplicates) {
    issues.push(issue("V1", `duplicate stage id "${id}" — stage ids must be unique`));
  }

  const byId = new Map(plan.stages.map((s) => [s.id, s]));
  for (const stage of plan.stages) {
    for (const dep of stage.dependsOn) {
      if (!byId.has(dep)) {
        issues.push(
          issue(
            "V1",
            `stage "${stage.id}" depends on unknown stage "${dep}"`,
            `/stages/${stage.id}/dependsOn`,
          ),
        );
      }
    }
  }
  // Cycle detection only makes sense once every reference resolves —
  // otherwise the walk below would throw on a missing map entry instead of
  // reporting a clean V1 issue for it (already reported above).
  if (issues.length > 0) return issues;

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(plan.stages.map((s) => [s.id, WHITE]));
  const cyclic = new Set<string>();

  function visit(id: string, stack: string[]): void {
    color.set(id, GRAY);
    const stage = byId.get(id);
    for (const dep of stage?.dependsOn ?? []) {
      const depColor = color.get(dep);
      if (depColor === GRAY) {
        for (const s of [...stack, id, dep]) cyclic.add(s);
      } else if (depColor === WHITE) {
        visit(dep, [...stack, id]);
      }
    }
    color.set(id, BLACK);
  }

  for (const stage of plan.stages) {
    if (color.get(stage.id) === WHITE) visit(stage.id, []);
  }
  if (cyclic.size > 0) {
    issues.push(issue("V1", `dependsOn forms a cycle involving stage(s): ${[...cyclic].sort().join(", ")}`));
  }

  return issues;
}

/** V2 — total committed budget (every stage's hardCap plus both reserve pools) must not exceed `budget.total`. */
export function validateV2(plan: Plan, budgetTotal: number): PlanValidationIssue[] {
  const stagesTotal = plan.stages.reduce((sum, s) => sum + s.tokenBudget.hardCap, 0);
  const reserveTotal = plan.reserve.synthesisTokens + plan.reserve.repairTokens;
  const grandTotal = stagesTotal + reserveTotal;
  if (grandTotal > budgetTotal) {
    return [
      issue(
        "V2",
        `sum of stage hardCaps (${String(stagesTotal)}) + reserve (${String(reserveTotal)}) = ` +
          `${String(grandTotal)} exceeds budget.total (${String(budgetTotal)})`,
      ),
    ];
  }
  return [];
}

/** V3 — every `Stage.agentType` must exist in the agent registry. */
export function validateV3(plan: Plan, knownAgentTypes: ReadonlySet<string>): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  for (const stage of plan.stages) {
    if (!knownAgentTypes.has(stage.agentType)) {
      issues.push(
        issue(
          "V3",
          `stage "${stage.id}" references unknown agentType "${stage.agentType}"`,
          `/stages/${stage.id}/agentType`,
        ),
      );
    }
  }
  return issues;
}

/** V4 — every stage's `maxOutputTokens` must leave the 10% safety margin under the model's real output ceiling. */
export function validateV4(plan: Plan, modelMaxOutputTokens: number): PlanValidationIssue[] {
  const safeMax = Math.floor(modelMaxOutputTokens * (1 - V4_SAFETY_MARGIN));
  const issues: PlanValidationIssue[] = [];
  for (const stage of plan.stages) {
    const requested = stage.outputContract.maxOutputTokens;
    if (requested > safeMax) {
      issues.push(
        issue(
          "V4",
          `stage "${stage.id}" outputContract.maxOutputTokens (${String(requested)}) exceeds the ` +
            `model's safety-margined ceiling (${String(safeMax)} = ${String(modelMaxOutputTokens)} × ${String(1 - V4_SAFETY_MARGIN)})`,
          `/stages/${stage.id}/outputContract/maxOutputTokens`,
        ),
      );
    }
  }
  return issues;
}

/**
 * V5 — every `inputs[].from` is either a static source ("artifacts" |
 * "blackboard") or the id of a stage that is a transitive dependency of the
 * consuming stage (i.e. genuinely earlier in DAG execution order, not just
 * earlier by array position).
 */
export function validateV5(plan: Plan): PlanValidationIssue[] {
  const byId = new Map(plan.stages.map((s) => [s.id, s]));
  const ancestorCache = new Map<string, ReadonlySet<string>>();

  function ancestorsOf(id: string, seen = new Set<string>()): ReadonlySet<string> {
    const cached = ancestorCache.get(id);
    if (cached) return cached;
    if (seen.has(id)) return new Set(); // guards against a cycle already reported by V1
    seen.add(id);
    const result = new Set<string>();
    const stage = byId.get(id);
    for (const dep of stage?.dependsOn ?? []) {
      result.add(dep);
      for (const a of ancestorsOf(dep, seen)) result.add(a);
    }
    ancestorCache.set(id, result);
    return result;
  }

  const issues: PlanValidationIssue[] = [];
  for (const stage of plan.stages) {
    const ancestors = ancestorsOf(stage.id);
    stage.inputs.forEach((input, index) => {
      if (STATIC_INPUT_SOURCES.has(input.from)) return;
      if (byId.has(input.from) && ancestors.has(input.from)) return;
      const reason = byId.has(input.from)
        ? `stage "${input.from}" is not a dependency of "${stage.id}" (not earlier in the DAG)`
        : `"${input.from}" is neither a known stage id nor a static source (artifacts | blackboard)`;
      issues.push(
        issue(
          "V5",
          `stage "${stage.id}" input[${String(index)}].from is invalid: ${reason}`,
          `/stages/${stage.id}/inputs/${String(index)}/from`,
        ),
      );
    });
  }
  return issues;
}

/**
 * V6 — per-stage fanout sanity (count/maxParallel ≥ 1) and the global
 * ceilings BUDGET.md §1 attaches to the run's goal-button level:
 * `maxParallel` per stage, an optional absolute `fanout.count` ceiling, and
 * `ensemble`/`debate` being blocked outright at `draft`.
 */
export function validateV6(
  plan: Plan,
  context: Pick<PlanValidationContext, "budgetLevel" | "globalMaxParallel" | "globalMaxFanoutCount">,
): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  const maxParallelCeiling = context.globalMaxParallel ?? BUDGET_LEVEL_MAX_PARALLEL[context.budgetLevel];
  const blocksEnsemble = BUDGET_LEVEL_BLOCKS_ENSEMBLE[context.budgetLevel];

  for (const stage of plan.stages) {
    const { count, maxParallel, mode } = stage.fanout;
    if (count < 1) {
      issues.push(
        issue("V6", `stage "${stage.id}" fanout.count must be ≥ 1`, `/stages/${stage.id}/fanout/count`),
      );
    }
    if (maxParallel < 1) {
      issues.push(
        issue(
          "V6",
          `stage "${stage.id}" fanout.maxParallel must be ≥ 1`,
          `/stages/${stage.id}/fanout/maxParallel`,
        ),
      );
    }
    if (context.globalMaxFanoutCount !== undefined && count > context.globalMaxFanoutCount) {
      issues.push(
        issue(
          "V6",
          `stage "${stage.id}" fanout.count (${String(count)}) exceeds the global ceiling (${String(context.globalMaxFanoutCount)})`,
          `/stages/${stage.id}/fanout/count`,
        ),
      );
    }
    if (maxParallelCeiling !== undefined && maxParallel > maxParallelCeiling) {
      issues.push(
        issue(
          "V6",
          `stage "${stage.id}" fanout.maxParallel (${String(maxParallel)}) exceeds the "${context.budgetLevel}" ` +
            `level's global ceiling (${String(maxParallelCeiling)})`,
          `/stages/${stage.id}/fanout/maxParallel`,
        ),
      );
    }
    if (blocksEnsemble && (mode === "ensemble" || mode === "debate")) {
      issues.push(
        issue(
          "V6",
          `stage "${stage.id}" uses fanout.mode "${mode}", which is blocked at budget level "${context.budgetLevel}" (BUDGET.md §1)`,
          `/stages/${stage.id}/fanout/mode`,
        ),
      );
    }
  }
  return issues;
}

/** V7 — every declared `Deliverable` must be produced by at least one stage, per the role mapping in `types.ts`. */
export function validateV7(plan: Plan): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  for (const deliverable of plan.deliverables) {
    const producingRoles = DELIVERABLE_KIND_AGENT_TYPES[deliverable.kind] ?? [];
    const hasProducer = plan.stages.some((s) => producingRoles.includes(s.agentType));
    if (!hasProducer) {
      issues.push(
        issue(
          "V7",
          `deliverable "${deliverable.id}" (kind "${deliverable.kind}") has no stage whose agentType can ` +
            `produce it (expected one of: ${producingRoles.join(", ") || "<none defined>"})`,
        ),
      );
    }
  }
  return issues;
}

/** V8 — `readPolicy.maxRung` must not exceed what the run's budget level permits (BUDGET.md §1). */
export function validateV8(plan: Plan, budgetLevel: BudgetLevel): PlanValidationIssue[] {
  const ceiling = BUDGET_LEVEL_MAX_RUNG[budgetLevel];
  const requested: ReadRung = plan.readPolicy.maxRung;
  if (rungIndex(requested) > rungIndex(ceiling)) {
    return [
      issue(
        "V8",
        `readPolicy.maxRung "${requested}" exceeds what budget level "${budgetLevel}" permits ("${ceiling}")`,
        "/readPolicy/maxRung",
      ),
    ];
  }
  return [];
}

/** V9 (P10-T6) — every `Stage.mergeStrategy` must exist in the reducer registry, when the caller supplies one to check against (omitted context = skipped, same convention as `globalMaxParallel`/`globalMaxFanoutCount`). */
export function validateV9(plan: Plan, knownReducerIds: ReadonlySet<string>): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  for (const stage of plan.stages) {
    if (!knownReducerIds.has(stage.mergeStrategy)) {
      issues.push(
        issue(
          "V9",
          `stage "${stage.id}" references unknown mergeStrategy "${stage.mergeStrategy}"`,
          `/stages/${stage.id}/mergeStrategy`,
        ),
      );
    }
  }
  return issues;
}

/**
 * P5-T1 — runs all 8 validations from PROTOCOLS.md §1, plus P10-T6's V9
 * when the caller opts in (`context.knownReducerIds`). Schema failure (V1's
 * zod half) short-circuits everything else, since none of V2-V9 can safely
 * inspect a document that didn't even parse. Every other validator always
 * runs and contributes its own issues, so a single invalid plan can surface
 * more than one problem at once instead of forcing a fix-one-rerun loop.
 */
export function validatePlan(input: unknown, context: PlanValidationContext): PlanValidationResult {
  const parsed = PlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((zodIssue) =>
        issue("V1", `schema: ${zodIssue.message}`, `/${zodIssue.path.join("/")}`),
      ),
    };
  }
  const plan = parsed.data;

  const issues: PlanValidationIssue[] = [
    ...validateV1(plan),
    ...validateV2(plan, context.budgetTotal),
    ...validateV3(plan, context.knownAgentTypes),
    ...validateV4(plan, context.modelMaxOutputTokens),
    ...validateV5(plan),
    ...validateV6(plan, context),
    ...validateV7(plan),
    ...validateV8(plan, context.budgetLevel),
    ...(context.knownReducerIds ? validateV9(plan, context.knownReducerIds) : []),
  ];

  return issues.length === 0 ? { valid: true, issues: [], plan } : { valid: false, issues };
}
