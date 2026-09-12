import type { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { createTagInputSchema, updateTagInputSchema } from "./tags.schema";

// The already-`.parse()`d shape (service.ts's job, never this file's).
type ParsedCreateTag = z.output<typeof createTagInputSchema>;
type ParsedTagPatch = z.output<typeof updateTagInputSchema>;

interface TagRow {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

const SELECT_COLUMNS = "id, name, color, created_at";

/** Insert carries `tenant_id` explicitly — RLS's `with check` compares it
 * against `current_tenant_id()` but PostgREST never fills it in for us.
 * `color` is only sent when present so an omitted color lets the DB's own
 * default (`"#6366f1"`, packages/db/src/schema.ts) apply, rather than the
 * schema needing its own `.default()`. */
export async function insertTag(tenantId: string, input: ParsedCreateTag) {
  const row: Record<string, unknown> = { tenant_id: tenantId, name: input.name };
  if (input.color !== undefined) row.color = input.color;
  return supabase.from("tags").insert(row).select(SELECT_COLUMNS).single<TagRow>();
}

// No `updated_at` column on `tags` (packages/db/src/schema.ts) — unlike
// clients/catalog/matters, so the patch never touches it.
export async function updateTag(id: string, input: ParsedTagPatch) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;

  return supabase.from("tags").update(patch).eq("id", id).select(SELECT_COLUMNS).single<TagRow>();
}

export async function fetchTagById(id: string) {
  return supabase.from("tags").select(SELECT_COLUMNS).eq("id", id).maybeSingle<TagRow>();
}

/** Exact-name lookup for the matter tag picker's "attach existing tag with
 * this name, else create it" inline path — RLS scopes it to the caller's
 * tenant, same as every other query here. */
export async function fetchTagByName(name: string) {
  return supabase.from("tags").select(SELECT_COLUMNS).eq("name", name).maybeSingle<TagRow>();
}

export async function listTags() {
  return supabase.from("tags").select(SELECT_COLUMNS).order("name", { ascending: true }).returns<TagRow[]>();
}

export async function fetchTagsByIds(ids: string[]) {
  return supabase.from("tags").select(SELECT_COLUMNS).in("id", ids).returns<TagRow[]>();
}

/** DB `matter_tags` FKs to `tags`/`matters` both carry `onDelete: "cascade"`
 * (packages/db/src/schema.ts) — deleting the tag row cascades every
 * `matter_tags` row referencing it for free, no explicit join-table delete
 * needed here. */
export async function deleteTag(id: string) {
  return supabase.from("tags").delete().eq("id", id);
}

// `matter_tags` — owned by the `tags` context per the spec's domain
// glossary even though the join is keyed by matter_id; `matters` reaches
// these only through tags.controller.ts, never this file (PLANNING §6).

export async function insertMatterTag(tenantId: string, matterId: string, tagId: string) {
  return supabase.from("matter_tags").insert({ tenant_id: tenantId, matter_id: matterId, tag_id: tagId });
}

export async function deleteMatterTag(matterId: string, tagId: string) {
  return supabase.from("matter_tags").delete().eq("matter_id", matterId).eq("tag_id", tagId);
}

interface MatterTagRow {
  tag_id: string;
}

export async function listTagIdsForMatter(matterId: string) {
  return supabase.from("matter_tags").select("tag_id").eq("matter_id", matterId).returns<MatterTagRow[]>();
}

// `deadline_tags` (deadlines-engine-alerts/01) — owned by the `tags`
// context per the spec's domain glossary, same reasoning as `matter_tags`
// above even though this join is keyed by deadline_id; `deadlines` reaches
// these only through tags.controller.ts, never this file (PLANNING §6). No
// `deleteTag` cascade comment repeated here — the FKs work the same way.

export async function insertDeadlineTag(tenantId: string, deadlineId: string, tagId: string) {
  return supabase.from("deadline_tags").insert({ tenant_id: tenantId, deadline_id: deadlineId, tag_id: tagId });
}

export async function deleteDeadlineTag(deadlineId: string, tagId: string) {
  return supabase.from("deadline_tags").delete().eq("deadline_id", deadlineId).eq("tag_id", tagId);
}

interface DeadlineTagRow {
  tag_id: string;
}

export async function listTagIdsForDeadline(deadlineId: string) {
  return supabase.from("deadline_tags").select("tag_id").eq("deadline_id", deadlineId).returns<DeadlineTagRow[]>();
}

interface DeadlineTagJoinRow {
  deadline_id: string;
  tag_id: string;
}

/** Batched form of listTagIdsForDeadline — one query for every deadline_id
 * instead of one per deadline (see MatterPrazosCard.tsx's refresh()). */
export async function listTagIdsForDeadlines(deadlineIds: string[]) {
  return supabase
    .from("deadline_tags")
    .select("deadline_id, tag_id")
    .in("deadline_id", deadlineIds)
    .returns<DeadlineTagJoinRow[]>();
}

export type { TagRow };
