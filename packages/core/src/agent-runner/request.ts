import { AgentDefinitionSchema, type AgentDefinition, type GenerateRequest } from "@ao/shared";

/**
 * P5-T6 — validates already-read `agent.json` content against the shared
 * registry schema (PROTOCOLS.md §10). "Loading" `agents/<type>/agent.json`
 * off disk is deliberately left to the composition root (not built in this
 * phase — `apps/runtime`), the same way `LLMProvider` itself is injected
 * rather than constructed here: `packages/core` stays free of filesystem
 * I/O (README's own constraint on this package), so this function's input
 * is the file's already-read text/JSON, not a path.
 */
export function parseAgentDefinition(json: unknown): AgentDefinition {
  return AgentDefinitionSchema.parse(json);
}

export interface BuildAgentRequestOptions {
  /** The concrete model id to call — resolved from `definition.tier` against the model registry by the caller (`packages/providers`'s `models.ts`); `core` has no registry of its own to resolve it with. */
  model: string;
  /** `CacheRef.name` of the Stage's shared Contract Block cache, when one exists (ARCHITECTURE.md §7's fan-out cache reuse). */
  cachedContentRef?: string;
  systemInstruction?: string;
}

/**
 * Assembles the `GenerateRequest` for one agent call from its
 * `AgentDefinition` and an already-filled prompt (`buildAgentPrompt`,
 * `prompt.ts`). Every worker agent's `outputContract.format` is fixed to
 * `"ndjson"` (PROTOCOLS.md §1/§10) — free-form line-delimited text, not a
 * single structured object — so this never sets `responseSchema`; that
 * mechanism is for the single-object outputs of `recon`/`planner`
 * (P5-T2/P5-T3), which build their own `GenerateRequest` directly against
 * `TaskUnderstandingSchema`/`PlanSchema` rather than going through the
 * generic NDJSON-oriented agent runner built here.
 */
export function buildAgentRequest(
  definition: AgentDefinition,
  filledPrompt: string,
  options: BuildAgentRequestOptions,
): GenerateRequest {
  const request: GenerateRequest = {
    model: options.model,
    contents: [{ role: "user", parts: [{ text: filledPrompt }] }],
    thinkingLevel: definition.thinkingLevel,
    maxOutputTokens: definition.outputContract.maxOutputTokens,
    temperature: definition.temperature,
  };
  if (options.systemInstruction !== undefined) request.systemInstruction = options.systemInstruction;
  if (options.cachedContentRef !== undefined) request.cachedContentRef = options.cachedContentRef;
  return request;
}
