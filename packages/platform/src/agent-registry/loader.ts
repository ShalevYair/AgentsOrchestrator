import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AgentDefinitionSchema, ConfigError, NotFoundError, type AgentDefinition } from "@ao/shared";

const AGENT_DEFINITION_FILE = "agent.json";

export interface LoadedAgent {
  definition: AgentDefinition;
  promptTemplate: string;
}

/**
 * Lists every registered agent type under `agentsDir` — one subdirectory per
 * type, each holding at least `agent.json` (PROTOCOLS.md §10). This is
 * nothing more than a directory scan, so "adding an agent type = adding a
 * folder, zero code changes" (P10-T1's own done-criterion) falls out for
 * free: a new folder just shows up here on the next call, nothing to wire.
 */
export function listAgentTypes(agentsDir: string): string[] {
  if (!existsSync(agentsDir)) {
    throw new NotFoundError(`agents directory not found: ${agentsDir}`);
  }
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(agentsDir, entry.name, AGENT_DEFINITION_FILE)))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Reads and validates `<agentsDir>/<type>/agent.json` fresh from disk on
 * every call — the file is never cached anywhere in this module, which is
 * what makes P10-T2's "hot reload" true by construction rather than by some
 * invalidation mechanism: there is nothing kept around between calls for an
 * edit to go stale against.
 */
export function loadAgentDefinition(agentsDir: string, type: string): AgentDefinition {
  const definitionPath = join(agentsDir, type, AGENT_DEFINITION_FILE);
  if (!existsSync(definitionPath)) {
    throw new NotFoundError(
      `unknown agent type "${type}" — no ${AGENT_DEFINITION_FILE} at ${definitionPath}`,
    );
  }
  let raw: string;
  try {
    raw = readFileSync(definitionPath, "utf8");
  } catch (cause) {
    throw new ConfigError(`could not read ${definitionPath}`, { cause });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (cause) {
    throw new ConfigError(`${definitionPath} is not valid JSON`, { cause });
  }
  const result = AgentDefinitionSchema.safeParse(json);
  if (!result.success) {
    throw new ConfigError(`${definitionPath} does not match AgentDefinitionSchema: ${result.error.message}`);
  }
  if (result.data.type !== type) {
    throw new ConfigError(
      `${definitionPath}'s "type" field ("${result.data.type}") does not match its folder name ("${type}")`,
    );
  }
  return result.data;
}

/**
 * Reads `<agentsDir>/<type>/<definition.promptFile>` as raw text — the
 * `agent.md` template `buildAgentPrompt` (packages/core/agent-runner) fills
 * in later. Takes the already-loaded `definition` rather than re-reading
 * `agent.json` itself, so callers that already have it (like `loadAgent`
 * below) never read the same file twice. Fresh from disk every call, same
 * hot-reload guarantee as `loadAgentDefinition`.
 */
export function loadAgentPromptTemplate(
  agentsDir: string,
  type: string,
  definition: AgentDefinition,
): string {
  const promptPath = join(agentsDir, type, definition.promptFile);
  if (!existsSync(promptPath)) {
    throw new NotFoundError(
      `agent "${type}" declares promptFile "${definition.promptFile}" but it's missing at ${promptPath}`,
    );
  }
  try {
    return readFileSync(promptPath, "utf8");
  } catch (cause) {
    throw new ConfigError(`could not read ${promptPath}`, { cause });
  }
}

/** Convenience: both halves of one agent's registration (`agent.json` + its prompt file), one fresh read each. */
export function loadAgent(agentsDir: string, type: string): LoadedAgent {
  const definition = loadAgentDefinition(agentsDir, type);
  const promptTemplate = loadAgentPromptTemplate(agentsDir, type, definition);
  return { definition, promptTemplate };
}
