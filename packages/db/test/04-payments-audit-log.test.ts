import { describe, expect, it } from "vitest";
import { createClient, createMatter, createPayment, createTenant, createUser } from "./fixtures";
import { withTx } from "./harness";

describe("payments RLS", () => {
  it("same-tenant read succeeds", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterA = await createMatter(tx.client, tenantA.id);
      const paymentA = await createPayment(tx.client, tenantA.id, matterA.id);

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query("select id from payments where id = $1", [
        paymentA.id,
      ]);

      expect(rows).toHaveLength(1);
    });
  });

  it("cross-tenant read returns zero rows", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterB = await createMatter(tx.client, tenantB.id);
      const paymentB = await createPayment(tx.client, tenantB.id, matterB.id);

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query("select id from payments where id = $1", [
        paymentB.id,
      ]);

      expect(rows).toHaveLength(0);
    });
  });

  it("cross-tenant insert (spoofed tenant_id) is rejected", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterB = await createMatter(tx.client, tenantB.id);

      await tx.asUser(userA.id);
      await expect(createPayment(tx.client, tenantB.id, matterB.id)).rejects.toThrow(
        /row-level security/i,
      );
    });
  });

  it("cross-tenant update/delete affect zero rows", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterB = await createMatter(tx.client, tenantB.id);
      const paymentB = await createPayment(tx.client, tenantB.id, matterB.id);

      await tx.asUser(userA.id);
      const updateResult = await tx.client.query(
        "update payments set status = 'pago' where id = $1",
        [paymentB.id],
      );
      const deleteResult = await tx.client.query("delete from payments where id = $1", [
        paymentB.id,
      ]);

      expect(updateResult.rowCount).toBe(0);
      expect(deleteResult.rowCount).toBe(0);
    });
  });
});

describe("audit_log", () => {
  it("a write to clients produces a matching audit_log row with correct user_id/tenant_id", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      const clientA = await createClient(tx.client, tenantA.id);

      const inserted = await tx.client.query<{
        tenant_id: string;
        user_id: string;
        action: string;
      }>("select tenant_id, user_id, action from audit_log where entity = 'clients' and entity_id = $1", [
        clientA.id,
      ]);
      expect(inserted.rows).toHaveLength(1);
      expect(inserted.rows[0]?.tenant_id).toBe(tenantA.id);
      expect(inserted.rows[0]?.user_id).toBe(userA.id);
      expect(inserted.rows[0]?.action).toBe("insert");

      await tx.client.query("update clients set name = $1 where id = $2", ["Novo Nome", clientA.id]);
      const updated = await tx.client.query<{ action: string }>(
        "select action from audit_log where entity = 'clients' and entity_id = $1 and action = 'update'",
        [clientA.id],
      );
      expect(updated.rows).toHaveLength(1);

      // A no-op update (nothing actually changed) shouldn't add a second
      // 'update' row — it would dilute the log for the exact accountability
      // use case it exists for.
      await tx.client.query("update clients set name = $1 where id = $2", ["Novo Nome", clientA.id]);
      const stillOne = await tx.client.query(
        "select action from audit_log where entity = 'clients' and entity_id = $1 and action = 'update'",
        [clientA.id],
      );
      expect(stillOne.rows).toHaveLength(1);
    });
  });

  it("a write to matters produces a matching audit_log row", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      const matterA = await createMatter(tx.client, tenantA.id);

      const { rows } = await tx.client.query<{ tenant_id: string; user_id: string }>(
        "select tenant_id, user_id from audit_log where entity = 'matters' and entity_id = $1",
        [matterA.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenant_id).toBe(tenantA.id);
      expect(rows[0]?.user_id).toBe(userA.id);
    });
  });

  it("a write to payments produces a matching audit_log row", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterA = await createMatter(tx.client, tenantA.id);

      await tx.asUser(userA.id);
      const paymentA = await createPayment(tx.client, tenantA.id, matterA.id);

      const { rows } = await tx.client.query<{ tenant_id: string; user_id: string }>(
        "select tenant_id, user_id from audit_log where entity = 'payments' and entity_id = $1",
        [paymentA.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenant_id).toBe(tenantA.id);
      expect(rows[0]?.user_id).toBe(userA.id);
    });
  });

  it("cross-tenant read of audit_log returns zero rows", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const userB = await createUser(tx.client, tenantB.id, "advogado");

      await tx.asUser(userB.id);
      const clientB = await createClient(tx.client, tenantB.id);

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query(
        "select id from audit_log where entity = 'clients' and entity_id = $1",
        [clientB.id],
      );

      expect(rows).toHaveLength(0);
    });
  });
});
