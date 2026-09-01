/* eslint-disable no-console */
import { createLogger, createSecretRegistry } from "@ao/platform";
import { GeminiProvider } from "./gemini/gemini-provider.js";
import { WORKER_MODEL_ID } from "./models.js";

/**
 * P1's phase-level "definition of done" (docs/TASKS.md §P1): a demo script
 * that sends a prompt, receives a stream, and prints the exact `usage`.
 *
 * This is intentionally NOT run by any test or CI step — it makes a real,
 * billed network call. It is guarded on `GEMINI_API_KEY` being set and
 * exits cleanly (not a crash, not a stack trace) when it isn't — which is
 * this environment's actual situation, since no key is configured here.
 * Run it manually with a real key: `GEMINI_API_KEY=... node dist/demo.js`
 * (after `pnpm --filter @ao/providers build`).
 */
export async function runDemo(apiKey: string | undefined): Promise<void> {
  if (!apiKey) {
    console.log(
      "GEMINI_API_KEY is not set — skipping the live demo. This is expected in this environment " +
        "(no key configured). Set GEMINI_API_KEY and re-run to exercise a real call:\n" +
        "  GEMINI_API_KEY=... node dist/demo.js",
    );
    return;
  }

  // Shared between the logger and the provider so the key is redacted
  // everywhere it could leak — logs (P0-T7) and outbound payloads (P1-T9) —
  // from a single registration, per GeminiProviderOptions.secretRegistry's doc comment.
  const secretRegistry = createSecretRegistry();
  const logger = createLogger({ level: "info", registry: secretRegistry });
  const provider = new GeminiProvider({ apiKey, secretRegistry, logger });

  const prompt = "In one short sentence, why is the sky blue?";
  console.log(`Sending prompt to ${WORKER_MODEL_ID}: ${JSON.stringify(prompt)}\n`);

  let text = "";
  let finalUsage: unknown;
  for await (const delta of provider.generate({
    model: WORKER_MODEL_ID,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  })) {
    text += delta.text;
    process.stdout.write(delta.text);
    if (delta.usage) finalUsage = delta.usage;
  }

  console.log("\n\n--- usage ---");
  console.log(JSON.stringify(finalUsage, null, 2));
  console.log(`\nFull response (${String(text.length)} chars) streamed successfully.`);
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href;
if (isDirectRun) {
  runDemo(process.env["GEMINI_API_KEY"]).catch((error: unknown) => {
    console.error("Demo failed:", error);
    process.exitCode = 1;
  });
}
