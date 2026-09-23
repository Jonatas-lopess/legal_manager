// Public API of the `insights` module (PLANNING §6) — the rest of the app
// reaches the daily-summary logic only through this file, never
// insights.service.ts/insights.repository.ts directly (enforced by
// eslint-plugin-boundaries, see eslint.config.ts).
export { getDailySummary } from "./insights.service";
export type { DailySummary } from "./insights.schema";
