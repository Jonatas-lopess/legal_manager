// Public API of the `tags` module (PLANNING §6) — the rest of the app
// (and every other module, e.g. `matters`, `deadlines`) reaches tag CRUD
// and matter-/deadline-tagging (`matter_tags`/`deadline_tags`, both owned by
// this context per the spec's domain glossary even though each join is
// keyed by the other entity's id) only through this file, never
// tags.service.ts/tags.repository.ts directly (enforced by
// eslint-plugin-boundaries, see eslint.config.ts).
export {
  createTag,
  updateTag,
  getTag,
  listTags,
  deleteTag,
  attachTagToMatter,
  attachTagToMatterByName,
  detachTagFromMatter,
  listTagsForMatter,
  attachTagToDeadline,
  attachTagToDeadlineByName,
  detachTagFromDeadline,
  listTagsForDeadline,
} from "./tags.service";
export type { Tag, CreateTagInput, UpdateTagInput } from "./tags.schema";
