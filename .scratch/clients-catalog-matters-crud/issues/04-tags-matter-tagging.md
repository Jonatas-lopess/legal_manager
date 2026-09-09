# 04: Tags + matter tagging

**What to build:** Minimal CRUD for `tags` (create with name+color, rename/recolor, delete — tenant-scoped) and attach/detach to a matter (`matter_tags`) from the matter detail view built in ticket 03. Tag creation is reachable inline from the matter's tag picker (no separate "manage tags" trip required). Deleting a tag removes its `matter_tags` rows too; detaching a tag from one matter never deletes the tag itself.

**Blocked by:** 03 (Matters CRUD — tag picker lives in the matter detail view)

**Status:** done

- [x] Create/rename/recolor/delete tag, tenant-scoped; cross-tenant tag list returns nothing
- [x] Attach a tag to a matter (creating it inline if new) reflected in that matter's tag list
- [x] Detach a tag from a matter removes only that attachment, tag and other matters' attachments untouched
- [x] Deleting a tag removes every `matter_tags` row referencing it (no orphaned rows)
- [x] Test seam: `tags.service.ts` against real local Supabase stack (no mocked `supabase-js`)

## Comments

Implemented as specced. Notes for ticket 05 (`payments`), which edits this same file's other placeholder right after:

- **`tags` table has no `updated_at` column** (`packages/db/src/schema.ts` — unlike `clients`/`catalog`/`matters`) — `tags.repository.ts`'s `updateTag` patch never sets it, unlike every other module's `update*`.
- **`color` has no `.default()` in the Zod schema, on purpose.** `packages/schema/src/index.ts`'s `createTagInputSchema.color` is a plain optional hex-regex field; `tags.repository.ts`'s `insertTag` only puts `color` in the insert payload when it's actually present, letting the DB's own default (`"#6366f1"`) apply otherwise. This sidesteps ticket 03's flagged zod v4 `.partial()`-doesn't-strip-`.default()` bug entirely rather than relying on it being fixed correctly — confirmed neither `name` nor `color` carries `.default()`, so `updateTagInputSchema = createTagInputSchema.partial()` (unlike `matters`' `status`) needed no special-casing.
- **`matter_tags` FK cascade confirmed real, not assumed.** Both `matter_tags` FKs (`packages/db/src/schema.ts`) carry `.onDelete("cascade")` against `tags`/`matters`. `tags.service.ts`'s `deleteTag` does a plain `DELETE FROM tags`, no explicit join-table cleanup — covered by the last test case, which also asserts re-attaching a same-named tag after delete produces a genuinely new tag id (no resurrection of the old `matter_tags` row).
- **`tags` owns `matter_tags` end-to-end**, per the spec's Implementation Decisions: `tags.repository.ts` has `insertMatterTag`/`deleteMatterTag`/`listTagIdsForMatter`; `tags.service.ts` exposes `attachTagToMatter(matterId, tagId)` (attach an existing tag by id), `attachTagToMatterByName(matterId, name, color?)` (find-or-create-then-attach — the inline picker path), `detachTagFromMatter`, `listTagsForMatter`; all four are re-exported from `tags.controller.ts`. `matters.repository.ts`/`matters.service.ts` were not touched. `listTagsForMatter` does a two-step query (`matter_tags.tag_id` list, then `tags` `.in("id", ids)`) rather than a PostgREST embedded select — no prior art for embedded selects anywhere else in this repo's repositories, and a composite-FK embed felt like an unnecessary risk to introduce here.
- **UI**: `apps/web/src/modules/tags/components/TagPicker.tsx` fills `MatterDetailView.tsx`'s `data-slot="matter-tags-panel"` Card — attached-tags chip list (each with a "×" remove button), a row of dashed-border quick-add buttons for the tenant's not-yet-attached tags, and an inline text+color+submit form that attaches-by-name (reuses an existing tag if the typed name matches one, else creates it) via `attachTagToMatterByName`. Only that Card's `CardContent` changed — `data-slot` attribute, the rest of the file's structure (core-fields Card, `data-slot="matter-payments-panel"` Card, edit dialog wiring) untouched, so ticket 05 lands on a clean file. No new dialog/wrapper added (plain inline form, matching prior tickets' "skip `panel-kit.tsx`, no new dialog primitive" calls); native `<input type="color">` + a `<datalist>` for name suggestions, no new dependency.
- No UI/component tests added, per the parent spec's Testing Decisions (no prior art in this repo).
