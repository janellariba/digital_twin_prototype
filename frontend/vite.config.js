// Vite config: React + Tailwind v4 plugin. No proxies yet (no backend in Step 1).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
