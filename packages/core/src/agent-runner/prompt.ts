import { ConfigError, toJsonSchema } from "@ao/shared";
import type { z } from "zod";

/**
 * The template variables PROTOCOLS.md §10 names explicitly:
 * `{{objective}}`, `{{shard}}`, `{{contract}}`, `{{evidence}}`,
 * `{{successCriteria}}`, `{{outputSpec}}`. `outputSchema` is not itself a
 * string — it's the live Zod schema `{{outputSpec}}` gets derived from
 * (`buildOutputSpec`), which is exactly what keeps the prompt's stated
 * contract and the parser's actual validator from ever drifting apart
 * (ADR-006).
 */
export interface AgentPromptVariables {
  objective: string;
  shard: string;
  contract: string;
  evidence: string;
  successCriteria: readonly string[];
  outputSchema: z.ZodType;
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/** Renders `schema` as the prompt-facing description of the shape each NDJSON line (or the single structured object, for `recon`/`planner`) must match — always derived fresh from the same Zod schema the parser validates against, never hand-authored prose that could drift from it (ADR-006). */
export function buildOutputSpec(schema: z.ZodType): string {
  return JSON.stringify(toJsonSchema(schema), null, 2);
}

/**
 * Substitutes every `{{name}}` in `template` from `variables`. Deliberately
 * strict: a placeholder with no matching variable throws rather than being
 * left in the prompt verbatim or silently dropped — a template that
 * references a variable this runner doesn't know how to fill is exactly
 * the "prompt and validator out of sync" bug ADR-006 exists to prevent, so
 * it should fail loudly at prompt-build time, not show up as a confused
 * model response later.
 */
export function fillTemplate(template: string, variables: Readonly<Record<string, string>>): string {
  const missing = new Set<string>();
  const filled = template.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    if (!(name in variables)) {
      missing.add(name);
      return match;
    }
    return variables[name]!;
  });
  if (missing.size > 0) {
    throw new ConfigError(`agent template references unknown variable(s): ${[...missing].sort().join(", ")}`);
  }
  return filled;
}

/** P5-T6 — fills `template` (an `agent.md` file's raw text) with `vars`, deriving `{{outputSpec}}` fresh from `vars.outputSchema` and formatting `successCriteria` as a bullet list. */
export function buildAgentPrompt(template: string, vars: AgentPromptVariables): string {
  const variables: Record<string, string> = {
    objective: vars.objective,
    shard: vars.shard,
    contract: vars.contract,
    evidence: vars.evidence,
    successCriteria: vars.successCriteria.map((c) => `- ${c}`).join("\n"),
    outputSpec: buildOutputSpec(vars.outputSchema),
  };
  return fillTemplate(template, variables);
}
