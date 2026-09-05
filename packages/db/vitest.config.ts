import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    // Real Postgres in a Testcontainers container — startup + a full
    // migration replay per run, slower than an in-process/mocked suite.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    teardownTimeout: 60_000,
    // One shared container (started in globalSetup) — test files must not
    // run as separate worker processes that would each look for their own.
    fileParallelism: false,
  },
});
