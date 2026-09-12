// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as controller from "../audit.controller";
import * as clients from "../../clients/clients.controller";
import * as matters from "../../matters/matters.controller";
import * as payments from "../../payments/payments.controller";
import * as tenants from "../../tenants/tenants.controller";
import {
  assertStackReachable,
  cleanupAll,
  closeHarness,
  deleteAuthUser,
  seedAdmin,
  seedMember,
  seedTenant,
} from "../../tenants/test/harness";

// Real disposable Postgres (`supabase start`), same harness every other
// module's integration suite uses — never a mocked client, per this
// codebase's standing testing convention (see tenants/test/harness.ts).

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

describe("audit.service — listAuditLog", () => {
  it("scopes to the caller's own tenant — a second tenant sees none of the first's entries", async () => {
    const { admin: adminA } = await loginAsNewAdmin();
    const clientA = await clients.createClient({ name: "Cliente Tenant A" });
    await tenants.logout();

    // A brand-new tenant has made no audited writes of its own yet, so its
    // own log is empty — the strongest possible isolation assertion (not
    // just "doesn't contain tenant A's ids", but nothing leaks in at all).
    await loginAsNewAdmin();
    const entriesB = await controller.listAuditLog();

    expect(entriesB).toEqual([]);
    expect(entriesB.some((e) => e.entityId === clientA.id || e.actor?.id === adminA.id)).toBe(false);
  });

  it("a create on clients/matters/payments produces a log row with the right action/entity/entityId/actor", async () => {
    const { admin } = await loginAsNewAdmin();

    const client = await clients.createClient({ name: "Cliente Auditado" });
    const matter = await matters.createMatter({ uf: "SP" });
    const payment = await payments.createPayment({ matterId: matter.id, value: 150.5 });

    const entries = await controller.listAuditLog();

    const clientEntry = entries.find((e) => e.entity === "clients" && e.entityId === client.id);
    const matterEntry = entries.find((e) => e.entity === "matters" && e.entityId === matter.id);
    const paymentEntry = entries.find((e) => e.entity === "payments" && e.entityId === payment.id);

    expect(clientEntry).toMatchObject({ action: "insert", actor: { id: admin.id, email: admin.email } });
    expect(matterEntry).toMatchObject({ action: "insert", actor: { id: admin.id, email: admin.email } });
    expect(paymentEntry).toMatchObject({ action: "insert", actor: { id: admin.id, email: admin.email } });
  });

  it("an update produces an 'update' row, and the entity filter narrows to just that table", async () => {
    await loginAsNewAdmin();
    const client = await clients.createClient({ name: "Cliente Original" });
    await clients.updateClient(client.id, { name: "Cliente Renomeado" });
    await matters.createMatter({ uf: "RJ" });

    const clientEntries = await controller.listAuditLog({ entity: "clients" });
    expect(clientEntries.every((e) => e.entity === "clients")).toBe(true);

    const updateEntry = clientEntries.find((e) => e.entityId === client.id && e.action === "update");
    expect(updateEntry).toBeDefined();

    // Reverse-chronological: the update (later) sorts before the insert
    // (earlier) for the same entity.
    const insertIndex = clientEntries.findIndex((e) => e.entityId === client.id && e.action === "insert");
    const updateIndex = clientEntries.findIndex((e) => e.entityId === client.id && e.action === "update");
    expect(updateIndex).toBeLessThan(insertIndex);
  });

  it("surfaces a row with a null actor once the acting user has been deleted, instead of dropping the row", async () => {
    const tenantId = await seedTenant();
    const admin = await seedAdmin(tenantId);
    // A second tenant member survives the admin's deletion below, so there's
    // still someone who can authenticate and query the log afterward.
    const colleague = await seedMember(tenantId, "advogado");

    await tenants.login({ email: admin.email, password: admin.password });
    const client = await clients.createClient({ name: "Cliente do Admin Removido" });
    await tenants.logout();

    // `public.users.id` -> `auth.users.id` is `ON DELETE CASCADE`, so this
    // also removes admin's `users` row; `audit_log.user_id` is `ON DELETE
    // SET NULL` against `users`, so the pre-existing audit_log row survives
    // with a null user_id rather than being deleted or orphaned.
    await deleteAuthUser(admin.id);

    await tenants.login({ email: colleague.email, password: colleague.password });
    const entries = await controller.listAuditLog({ entity: "clients" });

    const entry = entries.find((e) => e.entityId === client.id);
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ action: "insert", entity: "clients", actor: null });
  });

  it("date-range filter excludes entries outside the requested window", async () => {
    await loginAsNewAdmin();
    const client = await clients.createClient({ name: "Cliente Fora da Janela" });

    const farFuture = "2099-01-01";
    const entriesInFarFutureWindow = await controller.listAuditLog({ dateFrom: farFuture, dateTo: farFuture });
    expect(entriesInFarFutureWindow.some((e) => e.entityId === client.id)).toBe(false);

    // Local calendar date, not `.toISOString()`'s UTC date — the filter's
    // `dateFrom`/`dateTo` are local calendar dates (see
    // audit.repository.ts's `localDateStartUtcIso`), and the two can name a
    // different day near midnight depending on the runner's UTC offset.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const entriesToday = await controller.listAuditLog({ dateFrom: today, dateTo: today });
    expect(entriesToday.some((e) => e.entityId === client.id)).toBe(true);
  });
});
