// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as controller from "../matters.controller";
import * as clients from "../../clients/clients.controller";
import * as catalog from "../../catalog/catalog.controller";
import * as tenants from "../../tenants/tenants.controller";
import { assertStackReachable, cleanupAll, closeHarness, db, seedAdmin, seedTenant } from "../../tenants/test/harness";

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

/** A client + catalog item pair, created through the real (already-complete)
 * clients/catalog controllers — never their service/repository directly,
 * per PLANNING §6's cross-context rule. */
async function seedClientAndCatalogItem() {
  const client = await clients.createClient({ name: "Cliente do Processo" });
  const catalogItem = await catalog.createCatalogItem({ name: "Consultoria" });
  return { client, catalogItem };
}

describe("matters.service — CRUD + rascunho lifecycle + tenant isolation", () => {
  it("creates a rascunho matter with null client/catalog item, visible only within the acting tenant", async () => {
    await loginAsNewAdmin();

    const created = await controller.createMatter({ uf: "sp" });
    expect(created).toMatchObject({ status: "rascunho", clientId: null, matterCatalogItemId: null, uf: "SP" });

    const listed = await controller.listMatters();
    expect(listed.map((m) => m.id)).toContain(created.id);

    // Cross-tenant: a second tenant's admin sees nothing of the first.
    await tenants.logout();
    await loginAsNewAdmin();
    expect((await controller.listMatters()).map((m) => m.id)).not.toContain(created.id);
    expect(await controller.getMatter(created.id)).toBeNull();
  });

  it("rejects promotion to em_andamento while client or catalog item is still null; succeeds once both are set", async () => {
    await loginAsNewAdmin();
    const { client, catalogItem } = await seedClientAndCatalogItem();

    const created = await controller.createMatter({ uf: "RJ" });

    await expect(controller.updateMatter(created.id, { status: "em_andamento" })).rejects.toThrow();
    await expect(
      controller.updateMatter(created.id, { status: "em_andamento", clientId: client.id }),
    ).rejects.toThrow();
    await expect(
      controller.updateMatter(created.id, { status: "em_andamento", matterCatalogItemId: catalogItem.id }),
    ).rejects.toThrow();

    const promoted = await controller.updateMatter(created.id, {
      status: "em_andamento",
      clientId: client.id,
      matterCatalogItemId: catalogItem.id,
    });
    expect(promoted).toMatchObject({ status: "em_andamento", clientId: client.id, matterCatalogItemId: catalogItem.id });
  });

  it("also rejects clearing client/catalog item while status stays non-rascunho", async () => {
    await loginAsNewAdmin();
    const { client, catalogItem } = await seedClientAndCatalogItem();

    const created = await controller.createMatter({
      uf: "MG",
      clientId: client.id,
      matterCatalogItemId: catalogItem.id,
      status: "em_andamento",
    });

    await expect(controller.updateMatter(created.id, { clientId: null })).rejects.toThrow();
  });

  it("list/search/filter by status and by client, tenant-scoped", async () => {
    await loginAsNewAdmin();
    const { client, catalogItem } = await seedClientAndCatalogItem();
    const other = await clients.createClient({ name: "Outro Cliente" });

    const draft = await controller.createMatter({ uf: "SP" });
    const active = await controller.createMatter({
      uf: "SP",
      clientId: client.id,
      matterCatalogItemId: catalogItem.id,
      status: "em_andamento",
    });
    const forOtherClient = await controller.createMatter({ uf: "SP", clientId: other.id });

    const onlyDraft = await controller.listMatters({ status: "rascunho" });
    expect(onlyDraft.map((m) => m.id)).toContain(draft.id);
    expect(onlyDraft.map((m) => m.id)).not.toContain(active.id);

    const onlyForClient = await controller.listMatters({ clientId: client.id });
    expect(onlyForClient.map((m) => m.id)).toEqual([active.id]);
    expect(onlyForClient.map((m) => m.id)).not.toContain(forOtherClient.id);
  });

  it("edits core fields after creation", async () => {
    await loginAsNewAdmin();

    const created = await controller.createMatter({ uf: "SP", comarca: "Original" });
    const edited = await controller.updateMatter(created.id, {
      comarca: "Comarca Atualizada",
      municipio: "São Paulo",
      description: "Descrição atualizada",
    });
    expect(edited).toMatchObject({
      comarca: "Comarca Atualizada",
      municipio: "São Paulo",
      description: "Descrição atualizada",
    });
  });

  it("concluido/arquivado are settable with no extra gate beyond client+catalog set", async () => {
    await loginAsNewAdmin();
    const { client, catalogItem } = await seedClientAndCatalogItem();

    const created = await controller.createMatter({
      uf: "SP",
      clientId: client.id,
      matterCatalogItemId: catalogItem.id,
      status: "em_andamento",
    });

    const concluded = await controller.updateMatter(created.id, { status: "concluido" });
    expect(concluded.status).toBe("concluido");

    const archived = await controller.updateMatter(created.id, { status: "arquivado" });
    expect(archived.status).toBe("arquivado");
  });

  it("soft-delete hides from the default list but the row still resolves by id", async () => {
    await loginAsNewAdmin();

    const created = await controller.createMatter({ uf: "SP" });
    const deleted = await controller.softDeleteMatter(created.id);
    expect(deleted.deletedAt).not.toBeNull();

    const defaultList = await controller.listMatters();
    expect(defaultList.map((m) => m.id)).not.toContain(created.id);

    const stillFetchable = await controller.getMatter(created.id);
    expect(stillFetchable).toMatchObject({ id: created.id });
  });

  it("every create/update/status-change/soft-delete produces an audit_log row with the acting user_id", async () => {
    const { admin } = await loginAsNewAdmin();
    const { client, catalogItem } = await seedClientAndCatalogItem();

    const created = await controller.createMatter({ uf: "SP" });
    await controller.updateMatter(created.id, { comarca: "Comarca X" });
    await controller.updateMatter(created.id, {
      status: "em_andamento",
      clientId: client.id,
      matterCatalogItemId: catalogItem.id,
    });
    await controller.softDeleteMatter(created.id);

    const { rows } = await db.query(
      "select action, user_id from audit_log where entity = 'matters' and entity_id = $1 order by created_at asc",
      [created.id],
    );

    expect(rows.map((r: { action: string }) => r.action)).toEqual(["insert", "update", "update", "update"]);
    for (const row of rows) {
      expect(row.user_id).toBe(admin.id);
    }
  });
});
