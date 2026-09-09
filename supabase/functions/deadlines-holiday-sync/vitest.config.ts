import { defineConfig } from "vitest/config";

// Talks to a real, already-running local Supabase stack (`supabase start`
// at the repo root) — PostgREST directly (via the service-role key), never
// a mocked client (same testing decision as tenants/vitest.config.ts and
// packages/db). See test/harness.ts.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    testTimeout: 20_000,
  },
});
