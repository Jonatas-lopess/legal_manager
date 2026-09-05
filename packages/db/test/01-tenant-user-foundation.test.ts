import { describe, expect, it } from "vitest";
import { createTenant, createUser } from "./fixtures";
import { withTx } from "./harness";

describe("tenant/user foundation RLS", () => {
  it("a tenant member reads their own tenant's users but not another tenant's", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA1 = await createUser(tx.client, tenantA.id, "admin");
      const userA2 = await createUser(tx.client, tenantA.id, "advogado");
      const userB1 = await createUser(tx.client, tenantB.id, "admin");

      await tx.asUser(userA1.id);
      const { rows } = await tx.client.query<{ id: string }>("select id from users");

      expect(rows.map((r) => r.id).sort()).toEqual([userA1.id, userA2.id].sort());
      expect(rows.map((r) => r.id)).not.toContain(userB1.id);
    });
  });

  it("cross-tenant read on users returns zero rows", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      await createUser(tx.client, tenantB.id, "advogado");

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query("select id from users where tenant_id = $1", [
        tenantB.id,
      ]);

      expect(rows).toHaveLength(0);
    });
  });

  it("a tenant only sees its own tenants row", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query<{ id: string }>("select id from tenants");

      expect(rows.map((r) => r.id)).toEqual([tenantA.id]);
    });
  });

  it("current_tenant_id() reads live from users, not a cached value", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const user = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(user.id);
      const before = await tx.client.query<{ id: string }>("select public.current_tenant_id() as id");
      expect(before.rows[0]?.id).toBe(tenantA.id);

      await tx.asSuperuser();
      await tx.client.query("update users set tenant_id = $1 where id = $2", [tenantB.id, user.id]);
      await tx.asUser(user.id);

      const after = await tx.client.query<{ id: string }>("select public.current_tenant_id() as id");
      expect(after.rows[0]?.id).toBe(tenantB.id);
    });
  });
});
