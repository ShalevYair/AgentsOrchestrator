import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const runtimePort = process.env["AO_RUNTIME_PORT"] ?? "8787";
const runtimeTarget = `http://127.0.0.1:${runtimePort}`;

// P2-T1: `pnpm dev` runs @ao/runtime and @ao/web side by side (see root
// package.json / concurrently) on two different ports. Rather than teach
// the runtime CORS, the browser only ever talks to Vite's own origin and
// Vite proxies /api and /ws through to the runtime — works the same in
// dev regardless of platform since it's plain HTTP/WS forwarding, no shell
// involved (ADR-011).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: runtimeTarget, changeOrigin: true },
      "/ws": { target: runtimeTarget, ws: true },
    },
  },
});
