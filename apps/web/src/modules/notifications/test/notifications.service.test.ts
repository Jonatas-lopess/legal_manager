// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as controller from "../notifications.controller";
import * as tenants from "../../tenants/tenants.controller";
import { assertStackReachable, cleanupAll, closeHarness, db, seedAdmin, seedMember, seedTenant } from "../../tenants/test/harness";

await assertStackReachable();

afterEach(async () => {
  await tenants.logout().catch(() => {});
  await cleanupAll();
});
afterAll(closeHarness);

interface SeedNotificationOpts {
  tenantId: string;
  recipientUserId: string;
  channel?: "email" | "in_app";
  readAt?: string | null;
}

/** Direct SQL insert, bypassing RLS via the harness's own `db` Pool —
 * mirrors deadlines-holiday-sync/test/harness.ts's `seedHoliday` for the
 * same reason: `notifications` has no client-facing INSERT at all (ticket
 * 01's RLS migration grants `authenticated` no INSERT whatsoever — only the
 * deadlines-alerts Edge Function's direct-pg connection ever writes a row),
 * so this suite has to seed fixture rows the same way that job does, not
 * through this module's own controller. */
async function seedNotification(opts: SeedNotificationOpts): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into notifications (tenant_id, recipient_user_id, channel, category, payload, status, read_at)
     values ($1, $2, $3, 'deadline_alert', $4, 'pending', $5)
     returning id`,
    [
      opts.tenantId,
      opts.recipientUserId,
      opts.channel ?? "in_app",
      JSON.stringify({ matterLabel: "Processo (SP)", description: "Contestação (fixture)", dueDate: "2030-01-01" }),
      opts.readAt ?? null,
    ],
  );
  return rows[0]!.id;
}

describe("notifications.service — tenant/recipient isolation", () => {
  it("a user reads only their own notifications — not a tenant-mate's, not another tenant's", async () => {
    const tenantId = await seedTenant();
    const userA = await seedMember(tenantId, "advogado");
    const userB = await seedMember(tenantId, "advogado");
    const otherTenantId = await seedTenant();
    const otherUser = await seedAdmin(otherTenantId);

    const notifA = await seedNotification({ tenantId, recipientUserId: userA.id });
    await seedNotification({ tenantId, recipientUserId: userB.id }); // tenant-mate, different recipient
    await seedNotification({ tenantId: otherTenantId, recipientUserId: otherUser.id }); // another tenant entirely

    await tenants.login({ email: userA.email, password: userA.password });

    const mine = await controller.listMyNotifications();
    expect(mine.map((n) => n.id)).toEqual([notifA]);
  });

  it("only in_app-channel rows are read back — the email-channel row for the same alert is never listed", async () => {
    const tenantId = await seedTenant();
    const user = await seedAdmin(tenantId);

    const inApp = await seedNotification({ tenantId, recipientUserId: user.id, channel: "in_app" });
    await seedNotification({ tenantId, recipientUserId: user.id, channel: "email" });

    await tenants.login({ email: user.email, password: user.password });

    const mine = await controller.listMyNotifications();
    expect(mine.map((n) => n.id)).toEqual([inApp]);
  });
});

describe("notifications.service — mark read", () => {
  it("marking one notification read sets read_at, reflected on the next read", async () => {
    const tenantId = await seedTenant();
    const user = await seedAdmin(tenantId);
    const notifId = await seedNotification({ tenantId, recipientUserId: user.id });

    await tenants.login({ email: user.email, password: user.password });

    const before = await controller.listMyNotifications();
    expect(before.find((n) => n.id === notifId)?.readAt).toBeNull();

    const updated = await controller.markNotificationRead(notifId);
    expect(updated.readAt).not.toBeNull();

    const after = await controller.listMyNotifications();
    expect(after.find((n) => n.id === notifId)?.readAt).not.toBeNull();
  });
});
