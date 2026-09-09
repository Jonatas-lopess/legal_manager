import { describe, expect, it } from "vitest";
import {
  createCivilHoliday,
  createDeadline,
  createForensicHoliday,
  createMatter,
  createNotification,
  createTenant,
  createUser,
} from "./fixtures";
import { withTx } from "./harness";

describe("notifications RLS", () => {
  it("same-tenant same-recipient read succeeds", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const notifA = await createNotification(tx.client, tenantA.id, userA.id);

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query("select id from notifications where id = $1", [
        notifA.id,
      ]);

      expect(rows).toHaveLength(1);
    });
  });

  it("same-tenant different-recipient read returns zero rows (isolates by recipient, not just tenant)", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const userB = await createUser(tx.client, tenantA.id, "advogado");
      const notifB = await createNotification(tx.client, tenantA.id, userB.id);

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query("select id from notifications where id = $1", [
        notifB.id,
      ]);

      expect(rows).toHaveLength(0);
    });
  });

  it("cross-tenant read returns zero rows", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const tenantB = await createTenant(tx.client, "Tenant B");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const userB = await createUser(tx.client, tenantB.id, "advogado");
      const notifB = await createNotification(tx.client, tenantB.id, userB.id);

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query("select id from notifications where id = $1", [
        notifB.id,
      ]);

      expect(rows).toHaveLength(0);
    });
  });

  it("a client can update read_at on their own notification", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const notifA = await createNotification(tx.client, tenantA.id, userA.id);

      await tx.asUser(userA.id);
      const result = await tx.client.query(
        "update notifications set read_at = now() where id = $1",
        [notifA.id],
      );

      expect(result.rowCount).toBe(1);
    });
  });

  it("a client cannot insert a notification (no insert grant at all)", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      await expect(
        tx.client.query(
          `insert into notifications (tenant_id, recipient_user_id, channel, category, payload)
           values ($1, $2, 'email', 'deadline_alert', '{}'::jsonb)`,
          [tenantA.id, userA.id],
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("a client cannot update a column other than read_at (column-restricted grant)", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const notifA = await createNotification(tx.client, tenantA.id, userA.id);

      await tx.asUser(userA.id);
      await expect(
        tx.client.query("update notifications set status = 'sent' where id = $1", [notifA.id]),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

describe("civil_holidays / forensic_holidays RLS", () => {
  it("an authenticated user from any tenant can select civil_holidays", async () => {
    await withTx(async (tx) => {
      const holiday = await createCivilHoliday(tx.client, {
        uf: null,
        name: "Confraternização Universal",
      });
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query("select id from civil_holidays where id = $1", [
        holiday.id,
      ]);

      expect(rows).toHaveLength(1);
    });
  });

  it("an authenticated user from any tenant can select forensic_holidays", async () => {
    await withTx(async (tx) => {
      const holiday = await createForensicHoliday(tx.client);
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      const { rows } = await tx.client.query("select id from forensic_holidays where id = $1", [
        holiday.id,
      ]);

      expect(rows).toHaveLength(1);
    });
  });

  // A failed statement aborts the rest of the surrounding transaction in
  // Postgres, so each rejected operation gets its own withTx (no savepoints
  // in this harness — same one-failing-op-per-transaction convention as the
  // rest of this suite).
  it("no authenticated-role client can insert into civil_holidays", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      await expect(
        tx.client.query(
          "insert into civil_holidays (date, uf, name) values (now(), null, 'Novo Feriado')",
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("no authenticated-role client can update civil_holidays", async () => {
    await withTx(async (tx) => {
      const holiday = await createCivilHoliday(tx.client);
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      await expect(
        tx.client.query("update civil_holidays set name = 'Outro Nome' where id = $1", [
          holiday.id,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("no authenticated-role client can delete from civil_holidays", async () => {
    await withTx(async (tx) => {
      const holiday = await createCivilHoliday(tx.client);
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      await expect(
        tx.client.query("delete from civil_holidays where id = $1", [holiday.id]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("no authenticated-role client can insert into forensic_holidays", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      await expect(
        tx.client.query(
          `insert into forensic_holidays (start_date, end_date, description, source_year)
           values (now(), now(), 'Recesso', 2026)`,
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("no authenticated-role client can update forensic_holidays", async () => {
    await withTx(async (tx) => {
      const holiday = await createForensicHoliday(tx.client);
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      await expect(
        tx.client.query("update forensic_holidays set description = 'Outro' where id = $1", [
          holiday.id,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("no authenticated-role client can delete from forensic_holidays", async () => {
    await withTx(async (tx) => {
      const holiday = await createForensicHoliday(tx.client);
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asUser(userA.id);
      await expect(
        tx.client.query("delete from forensic_holidays where id = $1", [holiday.id]),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

describe("notifications unique constraint on (deadline_id, threshold, channel)", () => {
  it("rejects a duplicate (deadline_id, threshold, channel)", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterA = await createMatter(tx.client, tenantA.id);
      const deadlineA = await createDeadline(tx.client, tenantA.id, matterA.id);

      // authenticated has no insert grant on notifications at all — insert
      // as the superuser, same as every other fixture write.
      await tx.asSuperuser();
      await createNotification(tx.client, tenantA.id, userA.id, {
        deadlineId: deadlineA.id,
        threshold: "5_dias_uteis",
        channel: "email",
      });

      await expect(
        createNotification(tx.client, tenantA.id, userA.id, {
          deadlineId: deadlineA.id,
          threshold: "5_dias_uteis",
          channel: "email",
        }),
      ).rejects.toThrow(/duplicate key value/i);
    });
  });

  it("allows the same deadline_id/threshold with a different channel (not a false-positive conflict)", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");
      const matterA = await createMatter(tx.client, tenantA.id);
      const deadlineA = await createDeadline(tx.client, tenantA.id, matterA.id);

      await tx.asSuperuser();
      await createNotification(tx.client, tenantA.id, userA.id, {
        deadlineId: deadlineA.id,
        threshold: "5_dias_uteis",
        channel: "email",
      });

      await expect(
        createNotification(tx.client, tenantA.id, userA.id, {
          deadlineId: deadlineA.id,
          threshold: "5_dias_uteis",
          channel: "in_app",
        }),
      ).resolves.toBeDefined();
    });
  });

  it("allows two deadline_id-null rows with the same threshold/channel (partial index doesn't apply)", async () => {
    await withTx(async (tx) => {
      const tenantA = await createTenant(tx.client, "Tenant A");
      const userA = await createUser(tx.client, tenantA.id, "advogado");

      await tx.asSuperuser();
      await createNotification(tx.client, tenantA.id, userA.id, {
        deadlineId: null,
        threshold: "5_dias_uteis",
        channel: "email",
      });

      await expect(
        createNotification(tx.client, tenantA.id, userA.id, {
          deadlineId: null,
          threshold: "5_dias_uteis",
          channel: "email",
        }),
      ).resolves.toBeDefined();
    });
  });
});
