import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // .env lives at the repo root (see .env.example) — one file for the
  // whole monorepo, not per-package.
  envDir: path.resolve(__dirname, "../.."),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
