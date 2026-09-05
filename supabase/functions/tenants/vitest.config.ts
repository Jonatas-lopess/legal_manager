import { defineConfig } from "vitest/config";

// Talks to a real, already-running local Supabase stack (`supabase start`
// at the repo root) — GoTrue's Admin API and Postgres directly, never a
// mocked client (same testing decision as packages/db). See test/harness.ts.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    testTimeout: 20_000,
  },
});
