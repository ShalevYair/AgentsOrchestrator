import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../context.js";

interface RunParams {
  id: string;
}

/**
 * UX.md §2's "עצור" (stop) button, P9-T11. Idempotent by design, always
 * 204: whether `id` is a currently-running run (really signalled), already
 * finished on its own, or was never a real run at all, the client's next
 * move is identical either way — stop waiting for it — so there's nothing
 * worth surfacing as an error for what's an expected, benign race (the
 * run finishing right as the stop request lands).
 */
export function registerRunRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/runs/:id/stop", (request: FastifyRequest<{ Params: RunParams }>, reply) => {
    ctx.runRegistry.requestStop(request.params.id);
    reply.code(204).send();
  });
}
