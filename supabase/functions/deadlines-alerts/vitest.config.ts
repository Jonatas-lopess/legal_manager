import { defineConfig } from "vitest/config";

// Talks to a real, already-running local Supabase stack (`supabase start`
// at the repo root) via a direct Postgres connection (never a mocked
// client) — same testing decision as deadlines-holiday-sync/vitest.config.ts
// and packages/db. See test/harness.ts.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    testTimeout: 20_000,
  },
});
