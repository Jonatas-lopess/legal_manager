// @vitest-environment node
import { cpf, cnpj } from "cpf-cnpj-validator";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as controller from "../clients.controller";
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

describe("clients.service — CRUD + tenant isolation", () => {
  it("creates a client, visible only within the acting tenant", async () => {
    await loginAsNewAdmin();

    const created = await controller.createClient({ name: "Cliente Teste", cpf: cpf.generate(true) });
    expect(created).toMatchObject({ name: "Cliente Teste", status: "ativo" });

    const listed = await controller.listClients();
    expect(listed.map((c) => c.id)).toContain(created.id);

    // Cross-tenant: a second tenant's admin sees nothing of the first.
    await tenants.logout();
    await loginAsNewAdmin();
    expect((await controller.listClients()).map((c) => c.id)).not.toContain(created.id);
    expect(await controller.getClient(created.id)).toBeNull();
  });

  it("edit updates fields; soft-delete hides from the default list but the row still resolves by id", async () => {
    await loginAsNewAdmin();

    const created = await controller.createClient({ name: "Original" });
    const edited = await controller.updateClient(created.id, { name: "Atualizado", profession: "Advogado" });
    expect(edited).toMatchObject({ name: "Atualizado", profession: "Advogado" });

    const deleted = await controller.softDeleteClient(created.id);
    expect(deleted.deletedAt).not.toBeNull();

    const defaultList = await controller.listClients();
    expect(defaultList.map((c) => c.id)).not.toContain(created.id);

    const stillFetchable = await controller.getClient(created.id);
    expect(stillFetchable).toMatchObject({ id: created.id, name: "Atualizado" });
  });

  it("filters by ativo/inativo status", async () => {
    await loginAsNewAdmin();

    const active = await controller.createClient({ name: "Ativo Um", status: "ativo" });
    const inactive = await controller.createClient({ name: "Inativo Um", status: "inativo" });

    const onlyInactive = await controller.listClients({ status: "inativo" });
    expect(onlyInactive.map((c) => c.id)).toEqual([inactive.id]);
    expect(onlyInactive.map((c) => c.id)).not.toContain(active.id);

    const onlyActive = await controller.listClients({ status: "ativo" });
    expect(onlyActive.map((c) => c.id)).toContain(active.id);
  });

  it("rejects an invalid CPF/CNPJ before hitting the database", async () => {
    await loginAsNewAdmin();

    await expect(controller.createClient({ name: "X", cpf: "111.111.111-11" })).rejects.toThrow();
    await expect(controller.createClient({ name: "X", cnpj: "11.111.111/1111-11" })).rejects.toThrow();

    // A valid, freshly generated document of each kind is accepted.
    const withCpf = await controller.createClient({ name: "Com CPF", cpf: cpf.generate(true) });
    expect(withCpf.cpf).not.toBeNull();
    const withCnpj = await controller.createClient({ name: "Com CNPJ", cnpj: cnpj.generate(true) });
    expect(withCnpj.cnpj).not.toBeNull();
  });

  it("every create/update/soft-delete produces an audit_log row with the acting user_id", async () => {
    const { admin } = await loginAsNewAdmin();

    const created = await controller.createClient({ name: "Auditado" });
    await controller.updateClient(created.id, { name: "Auditado Editado" });
    await controller.softDeleteClient(created.id);

    const { rows } = await db.query(
      "select action, user_id from audit_log where entity = 'clients' and entity_id = $1 order by created_at asc",
      [created.id],
    );

    expect(rows.map((r: { action: string }) => r.action)).toEqual(["insert", "update", "update"]);
    for (const row of rows) {
      expect(row.user_id).toBe(admin.id);
    }
  });
});
