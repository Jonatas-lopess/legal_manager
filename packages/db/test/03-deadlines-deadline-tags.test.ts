import { describe, expect, it } from "vitest";
import {
  attachDeadlineTag,
  createDeadline,
  createMatter,
  createTag,
  createTenant,
  createUser,
} from "./fixtures";
import { withTx } from "./harness";

describe("deadlines RLS", () => {
  it("same-tenant read succeeds", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterA = await createMatter(tx.client, tenantA.id);
      const deadlineA = await createDeadline(tx.client, tenantA.id, matterA.id);

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query("select id from deadlines where id = $1", [
        deadlineA.id,
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
      const deadlineB = await createDeadline(tx.client, tenantB.id, matterB.id);

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query("select id from deadlines where id = $1", [
        deadlineB.id,
      ]);

      expect(rows).toHaveLength(0);
    });
  });

  it("cross-tenant insert (spoofed tenant_id) is rejected", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      // Matter must exist in tenant B for the composite FK to even be
      // reachable — the insert should still fail on the RLS check, not the FK.
      const matterB = await createMatter(tx.client, tenantB.id);

      await tx.asUser(userA.id);
      await expect(createDeadline(tx.client, tenantB.id, matterB.id)).rejects.toThrow(
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
      const deadlineB = await createDeadline(tx.client, tenantB.id, matterB.id);

      await tx.asUser(userA.id);
      const updateResult = await tx.client.query(
        "update deadlines set is_fatal = true where id = $1",
        [deadlineB.id],
      );
      const deleteResult = await tx.client.query("delete from deadlines where id = $1", [
        deadlineB.id,
      ]);

      expect(updateResult.rowCount).toBe(0);
      expect(deleteResult.rowCount).toBe(0);
    });
  });
});

describe("deadline_tags RLS", () => {
  it("same-tenant read succeeds, cross-tenant read returns zero rows", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      const matterA = await createMatter(tx.client, tenantA.id);
      const deadlineA = await createDeadline(tx.client, tenantA.id, matterA.id);
      const tagA = await createTag(tx.client, tenantA.id);
      await attachDeadlineTag(tx.client, tenantA.id, deadlineA.id, tagA.id);

      const matterB = await createMatter(tx.client, tenantB.id);
      const deadlineB = await createDeadline(tx.client, tenantB.id, matterB.id);
      const tagB = await createTag(tx.client, tenantB.id);
      await attachDeadlineTag(tx.client, tenantB.id, deadlineB.id, tagB.id);

      await tx.asUser(userA.id);
      const own = await tx.client.query("select * from deadline_tags where deadline_id = $1", [
        deadlineA.id,
      ]);
      const other = await tx.client.query("select * from deadline_tags where deadline_id = $1", [
        deadlineB.id,
      ]);

      expect(own.rows).toHaveLength(1);
      expect(other.rows).toHaveLength(0);
    });
  });

  it("tagging a deadline never changes is_fatal/counting_mode (cosmetic only, ADR-0003)", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterA = await createMatter(tx.client, tenantA.id);
      const deadlineA = await createDeadline(tx.client, tenantA.id, matterA.id, {
        isFatal: true,
        countingMode: "dias_uteis",
      });
      const tagA = await createTag(tx.client, tenantA.id);

      await tx.asUser(userA.id);
      await attachDeadlineTag(tx.client, tenantA.id, deadlineA.id, tagA.id);

      const { rows } = await tx.client.query<{ is_fatal: boolean; counting_mode: string }>(
        "select is_fatal, counting_mode from deadlines where id = $1",
        [deadlineA.id],
      );

      expect(rows[0]?.is_fatal).toBe(true);
      expect(rows[0]?.counting_mode).toBe("dias_uteis");
    });
  });
});
