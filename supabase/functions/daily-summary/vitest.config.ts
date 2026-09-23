import { defineConfig } from "vitest/config";

// Unlike deadlines-alerts/deadlines-holiday-sync, this function's test suite
// exercises only the pure/orchestration logic in service.ts against a mocked
// `db`/`authClient`/`callModel` — no real Postgres round trip, so no
// `global-setup.ts` DB harness is needed here. repository.ts's actual SQL
// (fetchPendingDeadlines, fetchActiveMattersCount, resolveTenantIdForUser)
// and the Groq HTTP call are exercised manually against a real local
// stack before deploy, same as this ticket's own verification notes.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
