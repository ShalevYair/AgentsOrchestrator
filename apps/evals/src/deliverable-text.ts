import type { NdjsonParseResult } from "@ao/core";

/**
 * P11-T4 — extracts the real, human-meaningful text a set of Task
 * outcomes actually produced (finding claims, note text, section bodies,
 * assembled file content) for the judge to score — never invented,
 * always pulled from the real parsed `NdjsonEnvelope`s/`AssembledFile`s
 * every Task already returned.
 */
export function extractDeliverableText(parsedResults: readonly NdjsonParseResult[]): string {
  const parts: string[] = [];
  for (const parsed of parsedResults) {
    for (const envelope of parsed.envelopes) {
      switch (envelope.t) {
        case "finding":
          parts.push(envelope.claim);
          break;
        case "note":
          parts.push(envelope.text);
          break;
        case "section":
          parts.push(`${envelope.title}\n${envelope.body}`);
          break;
        default:
          break;
      }
    }
    for (const file of parsed.files) {
      parts.push(file.data);
    }
  }
  return parts.join("\n\n");
}
