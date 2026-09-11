// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as repo from "../reports.repository";
import * as reportsController from "../reports.controller";
import * as clients from "../../clients/clients.controller";
import * as catalog from "../../catalog/catalog.controller";
import * as matters from "../../matters/matters.controller";
import * as payments from "../../payments/payments.controller";
import * as tenants from "../../tenants/tenants.controller";
import {
  assertStackReachable,
  cleanupAll,
  closeHarness,
  db,
  seedAdmin,
  seedMember,
  seedTenant,
} from "../../tenants/test/harness";

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

/** `matters_rascunho_or_client_and_catalog_set` (packages/db/src/schema.ts)
 * rejects a non-rascunho matter with no client/catalog item — so a
 * `em_andamento` fixture needs both set, unlike payments.service.test.ts's
 * bare `createDraftMatter()`. */
async function createEmAndamentoMatter() {
  const client = await clients.createClient({ name: `Cliente ${randomUUID()}` });
  const catalogItem = await catalog.createCatalogItem({ name: `Item ${randomUUID()}` });
  return matters.createMatter({
    uf: "SP",
    clientId: client.id,
    matterCatalogItemId: catalogItem.id,
    status: "em_andamento",
  });
}

async function createDraftMatter() {
  return matters.createMatter({ uf: "SP" });
}

describe("reports.repository — countClientsByStatus", () => {
  it("counts only the requested status, tenant-scoped", async () => {
    await loginAsNewAdmin();
    await clients.createClient({ name: `Ativo A ${randomUUID()}`, status: "ativo" });
    await clients.createClient({ name: `Ativo B ${randomUUID()}`, status: "ativo" });
    await clients.createClient({ name: `Inativo ${randomUUID()}`, status: "inativo" });

    const { count, error } = await repo.countClientsByStatus("ativo");
    expect(error).toBeNull();
    expect(count).toBe(2);
  });

  it("doesn't leak another tenant's clients", async () => {
    await loginAsNewAdmin();
    await clients.createClient({ name: `Tenant1 ${randomUUID()}`, status: "ativo" });

    await tenants.logout();
    await loginAsNewAdmin();

    const { count, error } = await repo.countClientsByStatus("ativo");
    expect(error).toBeNull();
    expect(count).toBe(0);
  });
});

describe("reports.repository — countMattersByStatus", () => {
  it("counts only the requested status, tenant-scoped", async () => {
    await loginAsNewAdmin();
    await createEmAndamentoMatter();
    await createDraftMatter(); // rascunho — must not count toward em_andamento

    const { count, error } = await repo.countMattersByStatus("em_andamento");
    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  it("doesn't leak another tenant's matters", async () => {
    await loginAsNewAdmin();
    await createEmAndamentoMatter();

    await tenants.logout();
    await loginAsNewAdmin();

    const { count, error } = await repo.countMattersByStatus("em_andamento");
    expect(error).toBeNull();
    expect(count).toBe(0);
  });
});

describe("reports.repository — sumPayments", () => {
  it("sums only the requested status, tenant-scoped, with no período filter", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();
    await payments.createPayment({ matterId: matter.id, value: 100 }); // stays pendente
    const toPago = await payments.createPayment({ matterId: matter.id, value: 250.5 });
    await payments.togglePaymentStatus(toPago.id); // pendente -> pago

    const { data, error } = await repo.sumPayments("pago");
    expect(error).toBeNull();
    const total = (data ?? []).reduce((sum, row) => sum + Number(row.value), 0);
    expect(total).toBe(250.5);
  });

  it("doesn't leak another tenant's payments", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();
    await payments.createPayment({ matterId: matter.id, value: 500 });

    await tenants.logout();
    await loginAsNewAdmin();

    const { data, error } = await repo.sumPayments("pendente");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("filters by período window (payments.created_at), including the boundary day and excluding outside it", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();

    const inWindow = await payments.createPayment({ matterId: matter.id, value: 111 });
    await payments.togglePaymentStatus(inWindow.id); // -> pago
    const onBoundary = await payments.createPayment({ matterId: matter.id, value: 222 });
    await payments.togglePaymentStatus(onBoundary.id); // -> pago
    const outOfWindow = await payments.createPayment({ matterId: matter.id, value: 999 });
    await payments.togglePaymentStatus(outOfWindow.id); // -> pago

    // Backdated via direct SQL through the harness's `db` pool — no
    // controller lets a caller set `created_at` directly, same precedent as
    // deadlines.repository.test.ts's civil_holidays fixtures.
    await db.query("update payments set created_at = $1 where id = $2", ["2031-06-15T10:00:00Z", inWindow.id]);
    await db.query("update payments set created_at = $1 where id = $2", ["2031-06-30T23:59:00Z", onBoundary.id]);
    await db.query("update payments set created_at = $1 where id = $2", ["2031-05-01T10:00:00Z", outOfWindow.id]);

    const { data, error } = await repo.sumPayments("pago", { from: "2031-06-01", to: "2031-06-30" });
    expect(error).toBeNull();
    const total = (data ?? []).reduce((sum, row) => sum + Number(row.value), 0);
    expect(total).toBe(333);
  });
});

// Faturamento/A receber hiding for `secretario` is a deliberate RBAC policy
// call beyond what ticket 01 literally states (see ticket's Comments) —
// this exercises it end-to-end through the real controller/service, not
// just the repository, since the gate lives in reports.service.ts.
describe("reports.controller — Faturamento/A receber hidden for secretario", () => {
  it("returns null for both figures when the caller is secretario, but Clientes ativos/Matters em andamento stay visible", async () => {
    const tenantId = await seedTenant();
    const admin = await seedAdmin(tenantId);
    await tenants.login({ email: admin.email, password: admin.password });
    const matter = await createDraftMatter();
    await payments.createPayment({ matterId: matter.id, value: 100 });
    await tenants.logout();

    const secretario = await seedMember(tenantId, "secretario");
    await tenants.login({ email: secretario.email, password: secretario.password });

    await expect(reportsController.getFaturamento("30d")).resolves.toBeNull();
    await expect(reportsController.getAReceber()).resolves.toBeNull();
    await expect(reportsController.getClientesAtivos()).resolves.toEqual(expect.any(Number));
    await expect(reportsController.getMattersEmAndamento()).resolves.toEqual(expect.any(Number));
  });
});

describe("reports.repository — sumPaymentsByDay", () => {
  it("doesn't leak another tenant's payments", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();
    const payment = await payments.createPayment({ matterId: matter.id, value: 500 });
    await payments.togglePaymentStatus(payment.id); // -> pago

    await tenants.logout();
    await loginAsNewAdmin();

    const { data, error } = await repo.sumPaymentsByDay({ from: "2000-01-01", to: "2100-01-01" });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("filters by período window (payments.created_at), including the boundary day and excluding outside it — same boundary rule as sumPayments", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();

    const inWindow = await payments.createPayment({ matterId: matter.id, value: 111 });
    await payments.togglePaymentStatus(inWindow.id); // -> pago
    const onBoundary = await payments.createPayment({ matterId: matter.id, value: 222 });
    await payments.togglePaymentStatus(onBoundary.id); // -> pago
    const outOfWindow = await payments.createPayment({ matterId: matter.id, value: 999 });
    await payments.togglePaymentStatus(outOfWindow.id); // -> pago
    const pendente = await payments.createPayment({ matterId: matter.id, value: 333 }); // stays pendente, must be excluded regardless of date

    await db.query("update payments set created_at = $1 where id = $2", ["2031-06-15T10:00:00Z", inWindow.id]);
    await db.query("update payments set created_at = $1 where id = $2", ["2031-06-30T23:59:00Z", onBoundary.id]);
    await db.query("update payments set created_at = $1 where id = $2", ["2031-05-01T10:00:00Z", outOfWindow.id]);
    await db.query("update payments set created_at = $1 where id = $2", ["2031-06-15T10:00:00Z", pendente.id]);

    const { data, error } = await repo.sumPaymentsByDay({ from: "2031-06-01", to: "2031-06-30" });
    expect(error).toBeNull();
    const total = (data ?? []).reduce((sum, row) => sum + Number(row.value), 0);
    expect(total).toBe(333);
  });
});

describe("reports.repository — listMatterCatalogItemIds", () => {
  it("returns one row per non-deleted matter's catalog-item id, tenant-scoped", async () => {
    await loginAsNewAdmin();
    const withItem = await createEmAndamentoMatter();
    const draft = await createDraftMatter(); // no catalog item — matter_catalog_item_id stays null
    const deleted = await createEmAndamentoMatter();
    await matters.softDeleteMatter(deleted.id);

    const { data, error } = await repo.listMatterCatalogItemIds();
    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.matter_catalog_item_id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(withItem.matterCatalogItemId);
    expect(ids).toContain(draft.matterCatalogItemId);
  });

  it("doesn't leak another tenant's matters", async () => {
    await loginAsNewAdmin();
    await createEmAndamentoMatter();

    await tenants.logout();
    await loginAsNewAdmin();

    const { data, error } = await repo.listMatterCatalogItemIds();
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

// getFaturamentoNoTempo hiding for `secretario` is the same deliberate RBAC
// judgment call as getFaturamento/getAReceber above (see ticket 02's
// Comments) — it's the same revenue metric, just plotted over time, so it's
// gated identically rather than leaking the total through the trend.
describe("reports.controller — getFaturamentoNoTempo hidden for secretario", () => {
  it("returns null for secretario, and a full zero-filled série for admin with no payments", async () => {
    const tenantId = await seedTenant();
    const admin = await seedAdmin(tenantId);
    await tenants.login({ email: admin.email, password: admin.password });

    const series = await reportsController.getFaturamentoNoTempo("7d");
    expect(series).not.toBeNull();
    expect(series!.length).toBe(8); // 7 days back through today, inclusive
    expect(series!.every((point) => point.total === 0)).toBe(true);
    await tenants.logout();

    const secretario = await seedMember(tenantId, "secretario");
    await tenants.login({ email: secretario.email, password: secretario.password });
    await expect(reportsController.getFaturamentoNoTempo("7d")).resolves.toBeNull();
  });
});
