// Public API of the `tags` module (PLANNING §6) — the rest of the app
// (and every other module, e.g. `matters`) reaches tag CRUD and
// matter-tagging (`matter_tags`, owned by this context per the spec's
// domain glossary even though the join is keyed by matter_id) only through
// this file, never tags.service.ts/tags.repository.ts directly (enforced
// by eslint-plugin-boundaries, see eslint.config.ts).
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
} from "./tags.service";
export type { Tag, CreateTagInput, UpdateTagInput } from "./tags.schema";
