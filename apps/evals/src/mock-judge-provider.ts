import { MockLLMProvider } from "@ao/providers";
import type { GenerateRequest } from "@ao/shared";
import { DELIVERABLE_END_MARKER, DELIVERABLE_START_MARKER, type Rubric } from "./judge.js";

/**
 * P11-T4 — a stand-in for a real LLM judge, honestly scoped: this harness
 * never makes a real network call (rule #6 — zero LLM/network in this
 * kind of test), so there is no real model to score real prose quality
 * with. What this *can* prove for real, without fabricating a quality
 * signal: the judge pipeline (rubric -> prompt -> parse -> weighted
 * score, on its own separate budget) actually works, is deterministic,
 * and reacts to the real deliverable it was given rather than returning
 * a fixed number regardless of input.
 *
 * The proxy: `score = min(1, deliverableText.length / 200)` per
 * criterion — crude, but a real, non-fabricated property of the actual
 * text this run produced (longer/richer real output scores higher), not
 * a hash or a hardcoded constant. This is NOT a claim that length
 * predicts quality; it is a placeholder property good enough to prove
 * "same input -> same score" and "different input -> different score"
 * for real. Meaningful content-quality judging only becomes possible once
 * a real model's output flows through here — a separate, later concern,
 * not something to fake now.
 */
export function createMockJudgeProvider(rubric: Rubric): MockLLMProvider {
  return new MockLLMProvider({
    responses: (request: GenerateRequest) => {
      const promptText = request.contents.flatMap((m) => m.parts.map((p) => p.text)).join("\n");
      const startIndex = promptText.indexOf(DELIVERABLE_START_MARKER);
      const contentStart = startIndex >= 0 ? startIndex + DELIVERABLE_START_MARKER.length : -1;
      const endIndex = contentStart >= 0 ? promptText.indexOf(DELIVERABLE_END_MARKER, contentStart) : -1;
      const deliverableText =
        contentStart >= 0 && endIndex >= 0 ? promptText.slice(contentStart, endIndex) : "";
      const lengthScore = Math.min(1, deliverableText.length / 200);

      const scores = rubric.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: lengthScore,
        rationale: `length-based mock score: deliverable is ${String(deliverableText.length)} chars`,
      }));

      return { text: JSON.stringify({ scores }) };
    },
  });
}
