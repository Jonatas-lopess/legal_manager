# 04: Tags + matter tagging

**What to build:** Minimal CRUD for `tags` (create with name+color, rename/recolor, delete — tenant-scoped) and attach/detach to a matter (`matter_tags`) from the matter detail view built in ticket 03. Tag creation is reachable inline from the matter's tag picker (no separate "manage tags" trip required). Deleting a tag removes its `matter_tags` rows too; detaching a tag from one matter never deletes the tag itself.

**Blocked by:** 03 (Matters CRUD — tag picker lives in the matter detail view)

**Status:** ready-for-agent

- [ ] Create/rename/recolor/delete tag, tenant-scoped; cross-tenant tag list returns nothing
- [ ] Attach a tag to a matter (creating it inline if new) reflected in that matter's tag list
- [ ] Detach a tag from a matter removes only that attachment, tag and other matters' attachments untouched
- [ ] Deleting a tag removes every `matter_tags` row referencing it (no orphaned rows)
- [ ] Test seam: `tags.service.ts` against real local Supabase stack (no mocked `supabase-js`)
