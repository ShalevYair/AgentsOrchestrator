import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../context.js";
import { listEventsSince } from "../db/events.repo.js";

interface RunParams {
  id: string;
}

interface EventsQuery {
  sinceSeq?: string;
}

/**
 * HTTP counterpart to the WS `subscribe` gap-fill path (P2-T6) — lets a
 * client do a plain fetch for "everything after seq N" without a live
 * socket, e.g. to render a run's history on page load before opening WS.
 */
export function registerEventRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get(
    "/api/runs/:id/events",
    (request: FastifyRequest<{ Params: RunParams; Querystring: EventsQuery }>) => {
      const sinceSeq =
        request.query.sinceSeq !== undefined ? Number.parseInt(request.query.sinceSeq, 10) : -1;
      return listEventsSince(ctx.driver, request.params.id, Number.isFinite(sinceSeq) ? sinceSeq : -1);
    },
  );
}
