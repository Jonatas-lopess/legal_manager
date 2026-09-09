import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SendEmailInput } from "../repository.ts";
import { runDeadlineAlerts } from "../service.ts";
import {
  cleanupAll,
  closeHarness,
  db,
  deleteCivilHolidaysByDates,
  fetchNotificationsForDeadline,
  seedCatalogItem,
  seedCivilHoliday,
  seedClient,
  seedDeadline,
  seedMatter,
  seedTenant,
  seedUser,
} from "./harness.ts";

// Fixed fixture "today" for every test in this file — deterministic
// regardless of when the suite actually runs (injected via
// `AlertsDeps.today`, never the real system clock). Far-future year, same
// isolation trick deadlines-holiday-sync/test/service.test.ts uses for its
// own global-reference-data fixtures (civil_holidays has no tenant_id/
// test-run marker to scope by) — nothing else will ever legitimately write
// a 2099 holiday.
const TODAY = "2099-06-01"; // a Monday (getUTCDay() === 1), confirmed by hand.

// A national holiday on the 3rd business day forward from TODAY
// (2099-06-04, a Thursday) — its presence is what shifts "5 business days
// forward" from 2099-06-08 (naive weekend-only count) to 2099-06-09 (correct
// count once the holiday is excluded). Asserting against the *shifted* date
// is what actually proves this function's own resolveNonBusinessDates/
// businessDaysForward re-derivation is reading civil_holidays at all, not
// just skipping weekends.
const HOLIDAY_DATE = "2099-06-04";

// Precomputed by hand (same algorithm businessDaysForward implements) —
// see this ticket's report for the derivation.
const FIVE_BDAYS_WITH_HOLIDAY = "2099-06-09"; // fires threshold 5
const FIVE_BDAYS_NO_HOLIDAY = "2099-06-08"; // would wrongly fire if the holiday were ignored
const ONE_BDAY = "2099-06-02"; // fires threshold 1
const TWO_BDAYS = "2099-06-03"; // does not fire threshold 1 (or 5)

function emailStub() {
  const calls: SendEmailInput[] = [];
  const sendEmail = async (input: SendEmailInput) => {
    calls.push(input);
  };
  return { sendEmail, calls };
}

beforeAll(async () => {
  await seedCivilHoliday(HOLIDAY_DATE, null, "Feriado nacional (fixture 2099)");
});

afterEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await deleteCivilHolidaysByDates([HOLIDAY_DATE]);
  await closeHarness();
});

async function seedTenantWithRecipients(count: number) {
  const tenantId = await seedTenant();
  const users = [];
  for (let i = 0; i < count; i++) users.push(await seedUser(tenantId));
  const matter = await seedMatter(tenantId);
  return { tenantId, users, matter };
}

describe("deadlines-alerts service — threshold detection", () => {
  it("fires exactly at 5 and exactly at 1 dias úteis (holiday-adjusted), not on adjacent dates", async () => {
    const { tenantId, users, matter } = await seedTenantWithRecipients(1);

    const fires5 = await seedDeadline(tenantId, matter.id, { dueDate: FIVE_BDAYS_WITH_HOLIDAY });
    const notFires5 = await seedDeadline(tenantId, matter.id, { dueDate: FIVE_BDAYS_NO_HOLIDAY });
    const fires1 = await seedDeadline(tenantId, matter.id, { dueDate: ONE_BDAY });
    const notFires1 = await seedDeadline(tenantId, matter.id, { dueDate: TWO_BDAYS });

    const { sendEmail, calls } = emailStub();
    const summary = await runDeadlineAlerts({ db, sendEmail, today: TODAY });

    expect(summary.thresholdsFired).toBe(2); // fires5 -> threshold 5, fires1 -> threshold 1
    expect(summary.notificationsCreated).toBe(4); // 2 firing deadlines x 1 recipient x 2 channels
    expect(summary.emailsSent).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.to)).toEqual([users[0]!.email, users[0]!.email]);

    const fires5Rows = await fetchNotificationsForDeadline(fires5.id);
    expect(fires5Rows).toHaveLength(2);
    expect(fires5Rows.map((r) => r.channel).sort()).toEqual(["email", "in_app"]);
    expect(fires5Rows.every((r) => r.threshold === "5_dias_uteis")).toBe(true);
    expect(fires5Rows.every((r) => r.recipient_user_id === users[0]!.id)).toBe(true);
    const sentRow = fires5Rows.find((r) => r.channel === "email")!;
    expect(sentRow.status).toBe("sent");
    expect(sentRow.sent_at).not.toBeNull();
    expect(sentRow.payload).toMatchObject({
      matterLabel: `Processo (${matter.uf})`,
      dueDate: FIVE_BDAYS_WITH_HOLIDAY,
    });

    const fires1Rows = await fetchNotificationsForDeadline(fires1.id);
    expect(fires1Rows).toHaveLength(2);
    expect(fires1Rows.every((r) => r.threshold === "1_dia_util")).toBe(true);

    // Neither "wrong" due date produced any row at all — proves the holiday
    // was actually applied (FIVE_BDAYS_NO_HOLIDAY would fire if it weren't)
    // and that an off-threshold due date fires nothing.
    expect(await fetchNotificationsForDeadline(notFires5.id)).toHaveLength(0);
    expect(await fetchNotificationsForDeadline(notFires1.id)).toHaveLength(0);
  });

  it("names the matter using client + catalog item names when both are present", async () => {
    const { tenantId, matter } = await seedTenantWithRecipients(1);
    const clientId = await seedClient(tenantId, "Cliente Fixture");
    const catalogItemId = await seedCatalogItem(tenantId, "Ação Trabalhista");
    // A second matter carrying the names — seedMatter's default fixture
    // above has neither, this one exercises the client+catalog path.
    const namedMatter = await seedMatter(tenantId, { uf: matter.uf, clientId, matterCatalogItemId: catalogItemId });
    const deadline = await seedDeadline(tenantId, namedMatter.id, {
      dueDate: ONE_BDAY,
      description: "Recurso de apelação",
    });

    await runDeadlineAlerts({ db, sendEmail: emailStub().sendEmail, today: TODAY });

    const rows = await fetchNotificationsForDeadline(deadline.id);
    expect(rows[0]!.payload).toMatchObject({
      matterLabel: "Cliente Fixture — Ação Trabalhista",
      description: "Recurso de apelação",
      dueDate: ONE_BDAY,
    });
  });
});

describe("deadlines-alerts service — dedup", () => {
  it("a rerun with the same fixture state inserts zero new rows and sends zero new emails", async () => {
    const { tenantId, matter } = await seedTenantWithRecipients(1);
    await seedDeadline(tenantId, matter.id, { dueDate: FIVE_BDAYS_WITH_HOLIDAY });

    const first = emailStub();
    const firstSummary = await runDeadlineAlerts({ db, sendEmail: first.sendEmail, today: TODAY });
    expect(firstSummary.notificationsCreated).toBe(2); // 1 recipient x 2 channels
    expect(firstSummary.emailsSent).toBe(1);

    const second = emailStub();
    const secondSummary = await runDeadlineAlerts({ db, sendEmail: second.sendEmail, today: TODAY });
    expect(secondSummary.thresholdsFired).toBe(1); // detection is stateless — it still "fires" logically...
    expect(secondSummary.notificationsCreated).toBe(0); // ...but every row already existed, so nothing new inserts
    expect(secondSummary.emailsSent).toBe(0);
    expect(second.calls).toHaveLength(0); // no duplicate Resend call
  });
});

describe("deadlines-alerts service — cumprido exclusion", () => {
  it("a cumprido deadline produces no alert even though its due_date matches a threshold", async () => {
    const { tenantId, matter } = await seedTenantWithRecipients(1);
    const deadline = await seedDeadline(tenantId, matter.id, {
      dueDate: FIVE_BDAYS_WITH_HOLIDAY,
      status: "cumprido",
    });

    const summary = await runDeadlineAlerts({ db, sendEmail: emailStub().sendEmail, today: TODAY });

    expect(summary.notificationsCreated).toBe(0);
    expect(await fetchNotificationsForDeadline(deadline.id)).toHaveLength(0);
  });
});

describe("deadlines-alerts service — tenant-scoped fan-out", () => {
  it("each tenant's firing deadline reaches only that tenant's own recipients, never the other tenant's", async () => {
    const tenantA = await seedTenantWithRecipients(2);
    const tenantB = await seedTenantWithRecipients(2);

    const deadlineA = await seedDeadline(tenantA.tenantId, tenantA.matter.id, { dueDate: FIVE_BDAYS_WITH_HOLIDAY });
    const deadlineB = await seedDeadline(tenantB.tenantId, tenantB.matter.id, { dueDate: ONE_BDAY });

    await runDeadlineAlerts({ db, sendEmail: emailStub().sendEmail, today: TODAY });

    const rowsA = await fetchNotificationsForDeadline(deadlineA.id);
    const rowsB = await fetchNotificationsForDeadline(deadlineB.id);

    const tenantAUserIds = new Set(tenantA.users.map((u) => u.id));
    const tenantBUserIds = new Set(tenantB.users.map((u) => u.id));

    expect(rowsA).toHaveLength(4); // 2 recipients x 2 channels
    expect(rowsA.every((r) => r.tenant_id === tenantA.tenantId)).toBe(true);
    expect(rowsA.every((r) => tenantAUserIds.has(r.recipient_user_id))).toBe(true);
    expect(rowsA.some((r) => tenantBUserIds.has(r.recipient_user_id))).toBe(false);

    expect(rowsB).toHaveLength(4);
    expect(rowsB.every((r) => r.tenant_id === tenantB.tenantId)).toBe(true);
    expect(rowsB.every((r) => tenantBUserIds.has(r.recipient_user_id))).toBe(true);
    expect(rowsB.some((r) => tenantAUserIds.has(r.recipient_user_id))).toBe(false);
  });
});
