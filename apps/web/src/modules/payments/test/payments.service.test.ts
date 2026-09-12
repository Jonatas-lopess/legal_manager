// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as controller from "../payments.controller";
import * as matters from "../../matters/matters.controller";
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

/** A `rascunho` matter — enough to record payments against (payments only
 * need `matter_id`/`tenant_id`, no lifecycle gate of their own). Created
 * through the real (already-complete) `matters` controller, never its
 * service/repository directly, per PLANNING §6's cross-context rule. */
async function createDraftMatter() {
  return matters.createMatter({ uf: "SP" });
}

describe("payments.service — create/list/toggle, matter-scoped, tenant-isolated", () => {
  it("advogado creates a payment (fixed value, default pendente) against a matter, scoped to the right matter/tenant", async () => {
    const tenantId = await seedTenant();
    const advogado = await seedMember(tenantId, "advogado");
    await tenants.login({ email: advogado.email, password: advogado.password });

    const matterA = await createDraftMatter();
    const matterB = await createDraftMatter();

    const created = await controller.createPayment({ matterId: matterA.id, value: 1500.5 });
    expect(created).toMatchObject({ matterId: matterA.id, value: 1500.5, status: "pendente", description: null });

    const listedA = await controller.listPaymentsForMatter(matterA.id);
    expect(listedA.map((p) => p.id)).toContain(created.id);

    // A payment created under matter A must not leak into matter B's list.
    const listedB = await controller.listPaymentsForMatter(matterB.id);
    expect(listedB.map((p) => p.id)).not.toContain(created.id);
  });

  it("description is nullable free text, set on create (ticket 03 addition — no parcela-number/split logic)", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();

    const withoutDescription = await controller.createPayment({ matterId: matter.id, value: 100 });
    expect(withoutDescription.description).toBeNull();

    const withDescription = await controller.createPayment({
      matterId: matter.id,
      value: 250,
      description: "Parcela 1/3 - Honorários Iniciais",
    });
    expect(withDescription.description).toBe("Parcela 1/3 - Honorários Iniciais");

    const listed = await controller.listPaymentsForMatter(matter.id);
    expect(listed.find((p) => p.id === withDescription.id)?.description).toBe("Parcela 1/3 - Honorários Iniciais");
  });

  it("admin/advogado can toggle a payment's status pago<->pendente", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();

    const created = await controller.createPayment({ matterId: matter.id, value: 200 });
    expect(created.status).toBe("pendente");

    const toggledToPago = await controller.togglePaymentStatus(created.id);
    expect(toggledToPago).toMatchObject({ id: created.id, status: "pago" });

    const toggledBack = await controller.togglePaymentStatus(created.id);
    expect(toggledBack).toMatchObject({ id: created.id, status: "pendente" });
  });

  it("list is tenant-scoped: a second tenant's admin sees nothing of the first tenant's payments", async () => {
    await loginAsNewAdmin();
    const matter = await createDraftMatter();
    const created = await controller.createPayment({ matterId: matter.id, value: 99 });

    await tenants.logout();
    await loginAsNewAdmin();

    const crossTenantList = await controller.listPaymentsForMatter(matter.id);
    expect(crossTenantList.map((p) => p.id)).not.toContain(created.id);
  });

  it("secretario is rejected on create, list, and status-toggle", async () => {
    const tenantId = await seedTenant();
    const admin = await seedAdmin(tenantId);
    await tenants.login({ email: admin.email, password: admin.password });
    const matter = await createDraftMatter();
    const existingPayment = await controller.createPayment({ matterId: matter.id, value: 350 });
    await tenants.logout();

    const secretario = await seedMember(tenantId, "secretario");
    await tenants.login({ email: secretario.email, password: secretario.password });

    await expect(controller.createPayment({ matterId: matter.id, value: 10 })).rejects.toThrow(
      "Secretário não tem acesso a pagamentos.",
    );
    await expect(controller.listPaymentsForMatter(matter.id)).rejects.toThrow(
      "Secretário não tem acesso a pagamentos.",
    );
    await expect(controller.togglePaymentStatus(existingPayment.id)).rejects.toThrow(
      "Secretário não tem acesso a pagamentos.",
    );
  });

  it("every create/status-change produces an audit_log row with the acting user_id", async () => {
    const { admin } = await loginAsNewAdmin();
    const matter = await createDraftMatter();

    const created = await controller.createPayment({ matterId: matter.id, value: 400 });
    await controller.togglePaymentStatus(created.id);

    const { rows } = await db.query(
      "select action, user_id from audit_log where entity = 'payments' and entity_id = $1 order by created_at asc",
      [created.id],
    );

    expect(rows.map((r: { action: string }) => r.action)).toEqual(["insert", "update"]);
    for (const row of rows) {
      expect(row.user_id).toBe(admin.id);
    }
  });
});
