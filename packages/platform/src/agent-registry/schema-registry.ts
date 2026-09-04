import { ConfigError, NdjsonEnvelopeSchema } from "@ao/shared";
import type { z } from "zod";

/**
 * Every NDJSON worker agent's output lines are validated against the same
 * `NdjsonEnvelopeSchema` union by the parser (packages/core/parse/ndjson.ts,
 * PROTOCOLS.md §3) regardless of agent type — so that's the only real entry
 * so far. A narrower per-type schema would need its own real parser support
 * first; registering one here without that would let an `agent.json` promise
 * a shape the parser doesn't actually enforce, exactly the drift ADR-006
 * exists to prevent.
 */
const OUTPUT_SCHEMAS: Readonly<Record<string, z.ZodType>> = {
  NdjsonEnvelope: NdjsonEnvelopeSchema,
};

/**
 * Resolves an `AgentDefinition.outputContract.schemaRef` string (from a real
 * `agent.json`) to the live Zod schema `{{outputSpec}}` must be derived from
 * (`buildAgentPrompt`, packages/core/agent-runner/prompt.ts) — the same
 * schema the NDJSON parser actually validates against, per ADR-006.
 */
export function resolveOutputSchema(schemaRef: string): z.ZodType {
  const schema = OUTPUT_SCHEMAS[schemaRef];
  if (!schema) {
    throw new ConfigError(
      `unknown outputContract.schemaRef "${schemaRef}" — known: ${Object.keys(OUTPUT_SCHEMAS).sort().join(", ")}`,
    );
  }
  return schema;
}
