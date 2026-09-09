import { createTagInputSchema, updateTagInputSchema } from "./tags.schema";
import type { Tag, CreateTagInput, UpdateTagInput } from "./tags.schema";
import * as repo from "./tags.repository";
import type { TagRow } from "./tags.repository";
import { getCurrentUser } from "../tenants/tenants.controller";

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

/** Insert carries `tenant_id` explicitly — RLS's `with check` compares it
 * against `current_tenant_id()` but PostgREST never fills it in for us. */
export async function createTag(input: CreateTagInput): Promise<Tag> {
  const parsed = createTagInputSchema.parse(input);

  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");

  const { data, error } = await repo.insertTag(user.tenantId, parsed);
  if (error || !data) throw error ?? new Error("Falha ao criar tag.");
  return toTag(data);
}

export async function updateTag(id: string, input: UpdateTagInput): Promise<Tag> {
  const parsed = updateTagInputSchema.parse(input);

  const { data, error } = await repo.updateTag(id, parsed);
  if (error || !data) throw error ?? new Error("Falha ao atualizar tag.");
  return toTag(data);
}

export async function getTag(id: string): Promise<Tag | null> {
  const { data, error } = await repo.fetchTagById(id);
  if (error) throw error;
  return data ? toTag(data) : null;
}

/** RLS scopes this to the caller's own tenant — see tags.repository. */
export async function listTags(): Promise<Tag[]> {
  const { data, error } = await repo.listTags();
  if (error) throw error;
  return (data ?? []).map(toTag);
}

/** No explicit `matter_tags` cleanup — the DB FKs already `onDelete:
 * "cascade"` on both `tag_id` and `matter_id` (verified against
 * packages/db/src/schema.ts), so deleting the tag row cascades every
 * attachment referencing it. */
export async function deleteTag(id: string): Promise<void> {
  const { error } = await repo.deleteTag(id);
  if (error) throw error;
}

/** Attaches an already-known tag id to a matter — the picker's "add one of
 * my existing tags" path. */
export async function attachTagToMatter(matterId: string, tagId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");

  const { error } = await repo.insertMatterTag(user.tenantId, matterId, tagId);
  if (error) throw error;
}

/** Attaches a tag to a matter by name, creating the tag first (with
 * `color`, if given) when no tag with that exact name exists yet in the
 * caller's tenant — the inline "type a new tag, no separate manage-tags
 * trip" path the matter tag picker composes (story 24). Returns the
 * attached (existing or newly-created) tag. */
export async function attachTagToMatterByName(matterId: string, name: string, color?: string): Promise<Tag> {
  const parsed = createTagInputSchema.parse({ name, color });

  const { data: existingRow, error: findError } = await repo.fetchTagByName(parsed.name);
  if (findError) throw findError;

  const tag = existingRow ? toTag(existingRow) : await createTag(parsed);
  await attachTagToMatter(matterId, tag.id);
  return tag;
}

/** Removes only this matter's attachment — the tag itself and its
 * attachments to every other matter are untouched (story 23). */
export async function detachTagFromMatter(matterId: string, tagId: string): Promise<void> {
  const { error } = await repo.deleteMatterTag(matterId, tagId);
  if (error) throw error;
}

/** RLS scopes both underlying queries to the caller's tenant. */
export async function listTagsForMatter(matterId: string): Promise<Tag[]> {
  const { data: joinRows, error: joinError } = await repo.listTagIdsForMatter(matterId);
  if (joinError) throw joinError;

  const tagIds = (joinRows ?? []).map((row) => row.tag_id);
  if (tagIds.length === 0) return [];

  const { data, error } = await repo.fetchTagsByIds(tagIds);
  if (error) throw error;
  return (data ?? []).map(toTag);
}

// --- deadline-tagging (deadlines-engine-alerts/03) — mirrors the
// *ForMatter/*ToMatter functions above exactly, parallel set for
// `deadline_tags` (ADR-0003: cosmetic only, never read by the counting
// engine).

/** Attaches an already-known tag id to a deadline — mirrors
 * attachTagToMatter. */
export async function attachTagToDeadline(deadlineId: string, tagId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");

  const { error } = await repo.insertDeadlineTag(user.tenantId, deadlineId, tagId);
  if (error) throw error;
}

/** Mirrors attachTagToMatterByName — the deadline tag picker's inline
 * add-existing-or-create-new path. */
export async function attachTagToDeadlineByName(deadlineId: string, name: string, color?: string): Promise<Tag> {
  const parsed = createTagInputSchema.parse({ name, color });

  const { data: existingRow, error: findError } = await repo.fetchTagByName(parsed.name);
  if (findError) throw findError;

  const tag = existingRow ? toTag(existingRow) : await createTag(parsed);
  await attachTagToDeadline(deadlineId, tag.id);
  return tag;
}

/** Removes only this deadline's attachment — mirrors detachTagFromMatter. */
export async function detachTagFromDeadline(deadlineId: string, tagId: string): Promise<void> {
  const { error } = await repo.deleteDeadlineTag(deadlineId, tagId);
  if (error) throw error;
}

/** RLS scopes both underlying queries to the caller's tenant. */
export async function listTagsForDeadline(deadlineId: string): Promise<Tag[]> {
  const { data: joinRows, error: joinError } = await repo.listTagIdsForDeadline(deadlineId);
  if (joinError) throw joinError;

  const tagIds = (joinRows ?? []).map((row) => row.tag_id);
  if (tagIds.length === 0) return [];

  const { data, error } = await repo.fetchTagsByIds(tagIds);
  if (error) throw error;
  return (data ?? []).map(toTag);
}
