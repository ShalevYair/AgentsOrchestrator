import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/health", () => ({
    status: "ok",
    provider: ctx.providerKind,
    model: ctx.model,
    telemetryEnabled: ctx.telemetry.enabled,
  }));
}
