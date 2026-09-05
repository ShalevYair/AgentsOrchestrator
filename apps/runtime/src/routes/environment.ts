import { checkEnvironment } from "@ao/tools";
import type { FastifyInstance } from "fastify";

/**
 * P12-T2. Stateless — reads the machine, not `AppContext` — so unlike every
 * other route file this one takes no `ctx`. Re-probed on every request
 * (Python/Docker discovery is sub-second local `spawnSync` calls, same
 * "cheap enough to not cache" call P10-T2 already made for agent files).
 */
export function registerEnvironmentRoutes(app: FastifyInstance): void {
  app.get("/api/environment", () => checkEnvironment());
}
