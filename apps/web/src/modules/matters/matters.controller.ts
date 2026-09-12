// Public API of the `matters` module (PLANNING §6) — the rest of the app
// (and every other module) reaches matter CRUD only through this file,
// never matters.service.ts/matters.repository.ts directly (enforced by
// eslint-plugin-boundaries, see eslint.config.ts).
export {
  createMatter,
  updateMatter,
  softDeleteMatter,
  getMatter,
  listMatters,
  matterFallbackLabel,
} from "./matters.service";
export { matterStatuses } from "./matters.schema";
export type { Matter, MatterStatus, CreateMatterInput, UpdateMatterInput, ListMattersFilter } from "./matters.schema";
