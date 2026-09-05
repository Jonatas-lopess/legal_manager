import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  // .env lives at the repo root (see .env.example) — one file for the
  // whole monorepo, not per-package. tenants.service.test.ts (`@vitest-
  // environment node`) needs VITE_SUPABASE_URL/ANON_KEY to reach the real
  // local Supabase stack (spec's testing decision: no mocked client).
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globalSetup: ["./src/test/global-setup.ts"],
    // tenants.service.test.ts hits a real local Supabase stack (GoTrue +
    // Postgres), slower than an in-process/mocked suite.
    testTimeout: 20_000,
  },
});
