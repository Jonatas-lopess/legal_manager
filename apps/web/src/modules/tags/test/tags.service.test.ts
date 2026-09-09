// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as controller from "../tags.controller";
import * as matters from "../../matters/matters.controller";
import * as tenants from "../../tenants/tenants.controller";
import { assertStackReachable, cleanupAll, closeHarness, seedAdmin, seedTenant } from "../../tenants/test/harness";

await assertStackReachable();

afterEach(async () => {
  await tenants.logout().catch(() => {});
  await cleanupAll();
});
afterAll(closeHarness);

async function loginAsNewAdmin() {
  const tenantId = await seedTenant();
  const admin = await seedAdmin(tenantId);
  await tenants.login({ email: admin.email, password: admin.password });
  return { tenantId, admin };
}

/** A `rascunho` matter with no client/catalog item — enough to attach tags
 * to. Created through the real (already-complete) `matters` controller,
 * never its service/repository directly, per PLANNING §6's cross-context
 * rule. */
async function createDraftMatter() {
  return matters.createMatter({ uf: "SP" });
}

describe("tags.service — CRUD + tenant isolation", () => {
  it("creates, renames, and recolors a tag, tenant-scoped", async () => {
    await loginAsNewAdmin();

    const created = await controller.createTag({ name: "Urgente" });
    expect(created).toMatchObject({ name: "Urgente", color: "#6366f1" });

    const renamed = await controller.updateTag(created.id, { name: "Muito urgente", color: "#ff0000" });
    expect(renamed).toMatchObject({ id: created.id, name: "Muito urgente", color: "#ff0000" });

    expect(await controller.getTag(created.id)).toMatchObject({ name: "Muito urgente", color: "#ff0000" });
  });

  it("list returns only the acting tenant's tags; cross-tenant list/get returns nothing", async () => {
    await loginAsNewAdmin();
    const created = await controller.createTag({ name: "Tenant Um" });

    const listed = await controller.listTags();
    expect(listed.map((t) => t.id)).toContain(created.id);

    await tenants.logout();
    await loginAsNewAdmin();
    const crossTenantList = await controller.listTags();
    expect(crossTenantList.map((t) => t.id)).not.toContain(created.id);
    expect(await controller.getTag(created.id)).toBeNull();
  });

  it("deletes a tag, tenant-scoped", async () => {
    await loginAsNewAdmin();
    const created = await controller.createTag({ name: "Descartável" });

    await controller.deleteTag(created.id);

    expect(await controller.getTag(created.id)).toBeNull();
    expect((await controller.listTags()).map((t) => t.id)).not.toContain(created.id);
  });
});

describe("tags.service — matter tagging", () => {
  it("attaches a tag to a matter — by id and by name (creating inline if new) — reflected in the matter's tag list", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();

    const createdInline = await controller.attachTagToMatterByName(matter.id, "Cível", "#00ff00");
    expect(createdInline).toMatchObject({ name: "Cível", color: "#00ff00" });

    const existingTag = await controller.createTag({ name: "Trabalhista" });
    await controller.attachTagToMatter(matter.id, existingTag.id);

    const tagsForMatter = await controller.listTagsForMatter(matter.id);
    expect(tagsForMatter.map((t) => t.id).sort()).toEqual([createdInline.id, existingTag.id].sort());
  });

  it("attaching by name reuses an existing tag rather than creating a duplicate", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();
    const existing = await controller.createTag({ name: "Reincidente" });

    const attached = await controller.attachTagToMatterByName(matter.id, "Reincidente");
    expect(attached.id).toBe(existing.id);

    const allTags = await controller.listTags();
    expect(allTags.filter((t) => t.name === "Reincidente")).toHaveLength(1);
  });

  it("detaching a tag from one matter leaves the tag and its other matters' attachments untouched", async () => {
    await loginAsNewAdmin();
    const matterA = await createDraftMatter();
    const matterB = await createDraftMatter();
    const tag = await controller.createTag({ name: "Compartilhada" });

    await controller.attachTagToMatter(matterA.id, tag.id);
    await controller.attachTagToMatter(matterB.id, tag.id);

    await controller.detachTagFromMatter(matterA.id, tag.id);

    expect((await controller.listTagsForMatter(matterA.id)).map((t) => t.id)).not.toContain(tag.id);
    expect((await controller.listTagsForMatter(matterB.id)).map((t) => t.id)).toContain(tag.id);
    expect(await controller.getTag(tag.id)).toMatchObject({ id: tag.id });
    expect((await controller.listTags()).map((t) => t.id)).toContain(tag.id);
  });

  it("deleting a tag removes every matter_tags row referencing it, with no resurrection on re-attach by the same name", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();
    const tag = await controller.createTag({ name: "Efêmera" });
    await controller.attachTagToMatter(matter.id, tag.id);

    expect((await controller.listTagsForMatter(matter.id)).map((t) => t.id)).toContain(tag.id);

    await controller.deleteTag(tag.id);

    expect((await controller.listTagsForMatter(matter.id)).map((t) => t.id)).not.toContain(tag.id);
    expect(await controller.getTag(tag.id)).toBeNull();

    // Re-attaching a tag with the same name creates a genuinely new row —
    // the old id is gone, so the old matter_tags attachment can't come back.
    const recreated = await controller.attachTagToMatterByName(matter.id, "Efêmera");
    expect(recreated.id).not.toBe(tag.id);

    const finalTags = await controller.listTagsForMatter(matter.id);
    expect(finalTags.map((t) => t.id)).toEqual([recreated.id]);
  });
});
