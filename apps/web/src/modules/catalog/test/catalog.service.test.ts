// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as controller from "../catalog.controller";
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

// The `matters` module (clients-catalog-matters-crud/03) isn't built yet —
// insert the referencing row directly against Postgres, same as the raw
// `audit_log`/`users` inserts other test harnesses in this spec already do.
async function insertMatterReferencing(tenantId: string, catalogItemId: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into matters (tenant_id, matter_catalog_item_id, uf) values ($1, $2, 'SP') returning id`,
    [tenantId, catalogItemId],
  );
  return rows[0]!.id;
}

describe("catalog.service — CRUD + tenant isolation", () => {
  it("creates and renames a catalog item, tenant-scoped", async () => {
    await loginAsNewAdmin();

    const created = await controller.createCatalogItem({ name: "Consultoria" });
    expect(created).toMatchObject({ name: "Consultoria" });

    const renamed = await controller.updateCatalogItem(created.id, { name: "Consultoria Trabalhista" });
    expect(renamed).toMatchObject({ id: created.id, name: "Consultoria Trabalhista" });
  });

  it("list returns only the acting tenant's items; cross-tenant list returns nothing", async () => {
    await loginAsNewAdmin();
    const created = await controller.createCatalogItem({ name: "Item Tenant Um" });

    const listed = await controller.listCatalogItems();
    expect(listed.map((i) => i.id)).toContain(created.id);

    await tenants.logout();
    await loginAsNewAdmin();
    const crossTenantList = await controller.listCatalogItems();
    expect(crossTenantList.map((i) => i.id)).not.toContain(created.id);
    expect(await controller.getCatalogItem(created.id)).toBeNull();
  });

  it("delete succeeds when the item has no referencing matters", async () => {
    await loginAsNewAdmin();
    const created = await controller.createCatalogItem({ name: "Sem Uso" });

    await controller.deleteCatalogItem(created.id);

    expect(await controller.getCatalogItem(created.id)).toBeNull();
  });

  it("delete is rejected — no row removed — when a matter references the item", async () => {
    const { tenantId } = await loginAsNewAdmin();
    const created = await controller.createCatalogItem({ name: "Em Uso" });
    await insertMatterReferencing(tenantId, created.id);

    await expect(controller.deleteCatalogItem(created.id)).rejects.toThrow();

    expect(await controller.getCatalogItem(created.id)).toMatchObject({ id: created.id });
  });
});
