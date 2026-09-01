import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerKeyRoutes } from "./routes/keys.js";
import { registerThreadRoutes } from "./routes/threads.js";
import { registerWsRoutes } from "./routes/ws.js";

/**
 * apps/runtime is the P2 composition root — this is the one place that
 * wires a concrete `AppContext` (DB driver, event hub, LLM provider,
 * key store) into HTTP + WS routes. Returns the built (but not yet
 * `listen()`ing) Fastify instance so tests can use `.inject()` /
 * `.listen({port: 0})` without going through `index.ts`'s process
 * lifecycle wiring.
 */
export async function buildServer(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyWebsocket);

  registerHealthRoutes(app, ctx);
  registerThreadRoutes(app, ctx);
  registerEventRoutes(app, ctx);
  registerKeyRoutes(app, ctx);
  registerWsRoutes(app, ctx);

  return app;
}
