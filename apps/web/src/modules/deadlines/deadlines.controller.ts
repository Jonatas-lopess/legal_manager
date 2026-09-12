// Public API of the `deadlines` module (PLANNING §6) — the rest of the app
// (and every other module) reaches deadline CRUD only through this file,
// never deadlines.service.ts/deadlines.repository.ts directly (enforced by
// eslint-plugin-boundaries, see eslint.config.ts).
export {
  createDeadline,
  updateDeadline,
  markDeadlineCumprido,
  getDeadline,
  listDeadlines,
  dueDateHighlight,
  getPrazoBuckets,
  todayLocalIso,
  toUtcMs,
} from "./deadlines.service";
export { countingModes, deadlineStatuses } from "./deadlines.schema";
export type {
  Deadline,
  DeadlineStatus,
  CountingMode,
  CreateDeadlineInput,
  UpdateDeadlineInput,
  ListDeadlinesFilter,
} from "./deadlines.schema";
export type { DueDateHighlight, PrazoBucketDeadline, PrazoBuckets } from "./deadlines.service";
