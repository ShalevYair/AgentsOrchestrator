import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";
import { registerEnvironmentRoutes } from "./routes/environment.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerKeyRoutes } from "./routes/keys.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerThreadRoutes } from "./routes/threads.js";
import { registerWsRoutes } from "./routes/ws.js";

export interface BuildServerOptions {
  /**
   * P12-T1. When given, the built web UI (`apps/web`'s `vite build` output)
   * is served from this directory at `/` — what turns "server + separate
   * dev-mode UI on another port" into the single-process, single-port
   * experience `npx agents-orchestrator` promises. Absent in every existing
   * test and in plain `pnpm dev` (Vite's own dev server + proxy handles the
   * UI there instead, see `apps/web/vite.config.ts`).
   */
  staticDir?: string;
}

/**
 * apps/runtime is the P2 composition root — this is the one place that
 * wires a concrete `AppContext` (DB driver, event hub, LLM provider,
 * key store) into HTTP + WS routes. Returns the built (but not yet
 * `listen()`ing) Fastify instance so tests can use `.inject()` /
 * `.listen({port: 0})` without going through `index.ts`'s process
 * lifecycle wiring.
 */
export async function buildServer(
  ctx: AppContext,
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyWebsocket);

  registerHealthRoutes(app, ctx);
  registerEnvironmentRoutes(app);
  registerThreadRoutes(app, ctx);
  registerEventRoutes(app, ctx);
  registerRunRoutes(app, ctx);
  registerKeyRoutes(app, ctx);
  registerWsRoutes(app, ctx);

  // Registered last: find-my-way (Fastify's router) always prefers the
  // exact routes above over this wildcard, regardless of registration
  // order, but the exact/dynamic-then-static ordering here is the more
  // readable of the two equivalent options.
  if (options.staticDir) {
    await app.register(fastifyStatic, { root: options.staticDir });
  }

  return app;
}
