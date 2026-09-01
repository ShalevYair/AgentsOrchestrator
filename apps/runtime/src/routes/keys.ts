import { validateApiKey, type KeyStoreBackend } from "@ao/providers";
import { SchemaValidationError } from "@ao/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../context.js";
import { sendAppError } from "./http-errors.js";

interface SetKeyBody {
  apiKey?: string;
}

/**
 * P2-T7: the raw key never comes back out of the runtime once stored —
 * every read-back (`status`) returns only `maskedKey` (e.g. `AIza••••3f2a`,
 * UX.md §8) plus which backend (`KeyStoreBackend`: OS keyring vs the
 * AES-GCM encrypted-file fallback, `@ao/providers`) is actually holding it
 * right now.
 */
function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(4)}${key.slice(-4)}`;
}

interface KeyStatus {
  hasKey: boolean;
  backend: KeyStoreBackend | null;
  maskedKey: string | null;
}

async function readStatus(ctx: AppContext): Promise<KeyStatus> {
  const key = await ctx.keyStore.get();
  return {
    hasKey: key !== null,
    backend: key !== null ? ctx.keyStore.backend : null,
    maskedKey: key !== null ? maskKey(key) : null,
  };
}

export function registerKeyRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/keys/status", async () => readStatus(ctx));

  app.post("/api/keys", async (request: FastifyRequest<{ Body: SetKeyBody }>, reply) => {
    try {
      const apiKey = request.body?.apiKey?.trim();
      if (!apiKey) {
        throw new SchemaValidationError("apiKey must be a non-empty string");
      }
      // Live check (models.list()) before ever persisting it — never trust
      // format alone (validateApiKey, P1-T4).
      await validateApiKey(ctx.createValidationProvider(apiKey));
      ctx.secretRegistry.register(apiKey);
      await ctx.keyStore.set(apiKey);
      reply.code(200).send(await readStatus(ctx));
    } catch (error) {
      sendAppError(reply, error);
    }
  });

  app.post("/api/keys/validate", async (_request, reply) => {
    try {
      const apiKey = await ctx.keyStore.get();
      if (!apiKey) {
        throw new SchemaValidationError("no API key is currently stored");
      }
      await validateApiKey(ctx.createValidationProvider(apiKey));
      reply.code(200).send({ valid: true });
    } catch (error) {
      sendAppError(reply, error);
    }
  });

  app.delete("/api/keys", async (_request, reply) => {
    await ctx.keyStore.delete();
    reply.code(200).send(await readStatus(ctx));
  });
}
