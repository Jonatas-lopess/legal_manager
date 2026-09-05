import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import {
  attachTag,
  createClient,
  createMatter,
  createMatterCatalogItem,
  createTag,
  createTenant,
  createUser,
} from "./fixtures";
import { withTx } from "./harness";

const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

interface Entity {
  table: string;
  /** Inserts one row for `tenantId`, already satisfying any retention gate. */
  insertOwn: (client: PoolClient, tenantId: string) => Promise<{ id: string }>;
  /**
   * A harmless self-assigning `SET` clause, touching a column `authenticated`
   * actually holds an UPDATE grant on (clients/matters restrict theirs to
   * exclude `retention_until` — see the RLS migration — so this can't just
   * be one column shared across every table).
   */
  touchSet: string;
}

const entities: Entity[] = [
  {
    table: "clients",
    insertOwn: (client, tenantId) => createClient(client, tenantId, { retentionUntil: pastDate }),
    touchSet: "updated_at = updated_at",
  },
  {
    table: "matter_catalog_items",
    insertOwn: (client, tenantId) => createMatterCatalogItem(client, tenantId),
    touchSet: "updated_at = updated_at",
  },
  {
    table: "matters",
    insertOwn: (client, tenantId) => createMatter(client, tenantId, { retentionUntil: pastDate }),
    touchSet: "updated_at = updated_at",
  },
  {
    table: "tags",
    insertOwn: (client, tenantId) => createTag(client, tenantId),
    touchSet: "name = name",
  },
];

describe.each(entities)("$table RLS", ({ table, insertOwn, touchSet }) => {
  it("same-tenant read succeeds", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const row = await insertOwn(tx.client, tenantA.id);

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query(`select id from ${table} where id = $1`, [row.id]);

      expect(rows).toHaveLength(1);
    });
  });

  it("cross-tenant read returns zero rows", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const rowB = await insertOwn(tx.client, tenantB.id);

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query(`select id from ${table} where id = $1`, [rowB.id]);

      expect(rows).toHaveLength(0);
    });
  });

  it("cross-tenant insert (spoofed tenant_id) is rejected", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      await expect(insertOwn(tx.client, tenantB.id)).rejects.toThrow(/row-level security/i);
    });
  });

  it("cross-tenant update affects zero rows", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const rowB = await insertOwn(tx.client, tenantB.id);

      await tx.asUser(userA.id);
      const result = await tx.client.query(`update ${table} set ${touchSet} where id = $1`, [
        rowB.id,
      ]);

      expect(result.rowCount).toBe(0);
    });
  });

  it("cross-tenant delete affects zero rows", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const rowB = await insertOwn(tx.client, tenantB.id);

      await tx.asUser(userA.id);
      const result = await tx.client.query(`delete from ${table} where id = $1`, [rowB.id]);

      expect(result.rowCount).toBe(0);
    });
  });
});

describe("matter_tags RLS", () => {
  it("same-tenant read succeeds, cross-tenant read returns zero rows", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      const matterA = await createMatter(tx.client, tenantA.id);
      const tagA = await createTag(tx.client, tenantA.id);
      await attachTag(tx.client, tenantA.id, matterA.id, tagA.id);

      const matterB = await createMatter(tx.client, tenantB.id);
      const tagB = await createTag(tx.client, tenantB.id);
      await attachTag(tx.client, tenantB.id, matterB.id, tagB.id);

      await tx.asUser(userA.id);
      const own = await tx.client.query("select * from matter_tags where matter_id = $1", [
        matterA.id,
      ]);
      const other = await tx.client.query("select * from matter_tags where matter_id = $1", [
        matterB.id,
      ]);

      expect(own.rows).toHaveLength(1);
      expect(other.rows).toHaveLength(0);
    });
  });

  it("tagging a matter never changes its own columns (cosmetic only)", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterA = await createMatter(tx.client, tenantA.id, { status: "rascunho" });
      const tagA = await createTag(tx.client, tenantA.id);

      await tx.asUser(userA.id);
      await attachTag(tx.client, tenantA.id, matterA.id, tagA.id);

      const { rows } = await tx.client.query<{ status: string }>(
        "select status from matters where id = $1",
        [matterA.id],
      );
      expect(rows[0]?.status).toBe("rascunho");
    });
  });

  it("a join row cannot be updated in place, only inserted/deleted", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterA = await createMatter(tx.client, tenantA.id);
      const tagA = await createTag(tx.client, tenantA.id);
      const tagA2 = await createTag(tx.client, tenantA.id, "Outra tag");
      await attachTag(tx.client, tenantA.id, matterA.id, tagA.id);

      await tx.asUser(userA.id);
      await expect(
        tx.client.query("update matter_tags set tag_id = $1 where matter_id = $2", [
          tagA2.id,
          matterA.id,
        ]),
      ).rejects.toThrow(/permission denied for table matter_tags/);
    });
  });
});

describe("matters rascunho lifecycle (ADR-0004)", () => {
  it("rascunho with null client_id and catalog item succeeds", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      const matter = await createMatter(tx.client, tenantA.id, {
        status: "rascunho",
        clientId: null,
        matterCatalogItemId: null,
      });

      expect(matter.id).toBeTruthy();
    });
  });

  it("promoting to em_andamento with client_id or catalog item still null is rejected", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      const matter = await createMatter(tx.client, tenantA.id, {
        status: "rascunho",
        clientId: null,
        matterCatalogItemId: null,
      });

      await expect(
        tx.client.query("update matters set status = 'em_andamento' where id = $1", [matter.id]),
      ).rejects.toThrow(/matters_rascunho_or_client_and_catalog_set/);
    });
  });

  it("promoting to em_andamento succeeds once client_id and catalog item are set", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const clientA = await createClient(tx.client, tenantA.id);
      const catalogA = await createMatterCatalogItem(tx.client, tenantA.id);

      await tx.asUser(userA.id);
      const matter = await createMatter(tx.client, tenantA.id, {
        status: "rascunho",
        clientId: clientA.id,
        matterCatalogItemId: catalogA.id,
      });

      await tx.client.query("update matters set status = 'em_andamento' where id = $1", [matter.id]);
      const { rows } = await tx.client.query<{ status: string }>(
        "select status from matters where id = $1",
        [matter.id],
      );
      expect(rows[0]?.status).toBe("em_andamento");
    });
  });
});

describe.each([{ table: "clients" as const }, { table: "matters" as const }])(
  "$table retention-gated physical delete",
  ({ table }) => {
    it("is rejected while retention_until is in the future", async () => {
      await withTx(async (tx) => {
        const tenantA = await createTenant(tx.client, "Tenant A");
        const userA = await createUser(tx.client, tenantA.id, "advogado");
        const row =
          table === "clients"
            ? await createClient(tx.client, tenantA.id, { retentionUntil: futureDate })
            : await createMatter(tx.client, tenantA.id, { retentionUntil: futureDate });

        await tx.asUser(userA.id);
        const result = await tx.client.query(`delete from ${table} where id = $1`, [row.id]);

        expect(result.rowCount).toBe(0);
      });
    });

    it("succeeds once retention_until is in the past", async () => {
      await withTx(async (tx) => {
        const tenantA = await createTenant(tx.client, "Tenant A");
        const userA = await createUser(tx.client, tenantA.id, "advogado");
        const row =
          table === "clients"
            ? await createClient(tx.client, tenantA.id, { retentionUntil: pastDate })
            : await createMatter(tx.client, tenantA.id, { retentionUntil: pastDate });

        await tx.asUser(userA.id);
        const result = await tx.client.query(`delete from ${table} where id = $1`, [row.id]);

        expect(result.rowCount).toBe(1);
      });
    });

    it("soft-delete (deleted_at) is a plain update, not gated by retention", async () => {
      await withTx(async (tx) => {
        const tenantA = await createTenant(tx.client, "Tenant A");
        const userA = await createUser(tx.client, tenantA.id, "advogado");
        const row =
          table === "clients"
            ? await createClient(tx.client, tenantA.id, { retentionUntil: futureDate })
            : await createMatter(tx.client, tenantA.id, { retentionUntil: futureDate });

        await tx.asUser(userA.id);
        const result = await tx.client.query(`update ${table} set deleted_at = now() where id = $1`, [
          row.id,
        ]);

        expect(result.rowCount).toBe(1);
      });
    });

    it("retention_until itself cannot be updated by a tenant member (would bypass the delete gate)", async () => {
      await withTx(async (tx) => {
        const tenantA = await createTenant(tx.client, "Tenant A");
        const userA = await createUser(tx.client, tenantA.id, "advogado");
        const row =
          table === "clients"
            ? await createClient(tx.client, tenantA.id, { retentionUntil: futureDate })
            : await createMatter(tx.client, tenantA.id, { retentionUntil: futureDate });

        await tx.asUser(userA.id);
        await expect(
          tx.client.query(`update ${table} set retention_until = $1 where id = $2`, [pastDate, row.id]),
        ).rejects.toThrow(/permission denied/i);
      });
    });
  },
);
