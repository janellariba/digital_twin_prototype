// Vite config: React + Tailwind v4. Requests to /api are forwarded to the
// FastAPI server, so the browser only ever talks to one origin.
// API_TARGET can be changed in frontend/.env (default: the server on this PC).
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // 127.0.0.1 rather than localhost: on Windows "localhost" can resolve to IPv6 and stall.
  const target = env.API_TARGET || "http://127.0.0.1:8000";
  const proxy = { "/api": { target, changeOrigin: false } };
  return {
    plugins: [react(), tailwindcss()],
    server: { proxy },
    preview: { proxy },
  };
});
