import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { hashCoupon } from "@/lib/coupon";
import { getDashboardStats } from "@/services/statsService";
import { listAuditLogs, AUDIT_PAGE_SIZE } from "@/services/auditService";

// The database may already hold demo data, so these tests measure CHANGES: take the stats, add known rows, take the stats again.
const TS = Date.now();
const P = `stats${TS}`;
const created = { users: [] as string[] };

afterAll(async () => {
  await db.pointsLedgerEntry.deleteMany({ where: { userId: { in: created.users } } });
  await db.rewardClaim.deleteMany({ where: { userId: { in: created.users } } });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: created.users } }, { action: { startsWith: `TEST_${TS}` } }] } });
  await db.reward.deleteMany({ where: { name: { startsWith: P } } });
  await db.product.deleteMany({ where: { productId: { startsWith: P } } });
  await db.user.deleteMany({ where: { id: { in: created.users } } });
  await db.$disconnect();
});

describe("getDashboardStats", () => {
  it("reflects new claims, points, requests, flags and failures", async () => {
    const before = await getDashboardStats();

    const user = await db.user.create({ data: { email: `${P}@example.com`, passwordHash: "x" } });
    created.users.push(user.id);

    // Two units: one claimed, one unclaimed.
    await db.product.create({ data: { productId: `${P}-a`, sku: "S", name: "A", pointsValue: 10, couponHash: hashCoupon(`S${TS}AAAA`), status: "CLAIMED", claimedById: user.id, claimedAt: new Date() } });
    await db.product.create({ data: { productId: `${P}-b`, sku: "S", name: "B", pointsValue: 10, couponHash: hashCoupon(`S${TS}BBBB`) } });

    // Points: +10 earned, -4 spent on a reward, +1 refunded, +5 manual adjustment.
    const reward = await db.reward.create({ data: { name: `${P}-r`, pointsCost: 4, stock: 5 } });
    await db.rewardClaim.create({ data: { userId: user.id, rewardId: reward.id, pointsSpent: 4 } });
    await db.pointsLedgerEntry.createMany({
      data: [
        { userId: user.id, delta: 10, reason: "PURCHASE_CLAIM" },
        { userId: user.id, delta: -4, reason: "REWARD_SPEND" },
        { userId: user.id, delta: 1, reason: "REWARD_REFUND" },
        { userId: user.id, delta: 5, reason: "ADJUSTMENT" },
      ],
    });

    await db.auditLog.create({ data: { category: "FRAUD_FLAG", action: `TEST_${TS}_FLAG`, flagStatus: "OPEN" } });
    await db.auditLog.create({ data: { action: "CLAIM_FAILED", actorId: user.id } });
    await db.auditLog.create({ data: { action: "CLAIM_BLOCKED", actorId: user.id } });

    const after = await getDashboardStats();

    expect(after.units.claimed - before.units.claimed).toBe(1);
    expect(after.units.unclaimed - before.units.unclaimed).toBe(1);
    expect(after.units.total - before.units.total).toBe(2);
    expect(after.points.issued - before.points.issued).toBe(10);
    expect(after.points.spent - before.points.spent).toBe(3); // 4 spent, 1 refunded
    expect(after.points.adjustments - before.points.adjustments).toBe(5);
    expect(after.points.outstanding - before.points.outstanding).toBe(12); // 10 - 4 + 1 + 5
    expect(after.customers.total - before.customers.total).toBe(1);
    expect(after.customers.active30d - before.customers.active30d).toBe(1);
    expect(after.rewardRequests.pending - before.rewardRequests.pending).toBe(1);
    expect(after.security.openFlags - before.security.openFlags).toBe(1);
    expect(after.security.failedClaims24h - before.security.failedClaims24h).toBe(1);
    expect(after.security.blockedClaims24h - before.security.blockedClaims24h).toBe(1);
  });

  it("returns a 30-day trend that includes today's claim", async () => {
    const stats = await getDashboardStats();
    expect(stats.trend).toHaveLength(30);
    const today = stats.trend[29];
    expect(today.day).toBe(new Date().toISOString().slice(0, 10));
    expect(today.claims).toBeGreaterThanOrEqual(1);
    expect(today.points).toBeGreaterThanOrEqual(10);
  });

  it("keeps the redemption rate between 0 and 1", async () => {
    const { units } = await getDashboardStats();
    expect(units.redemptionRate).toBeGreaterThanOrEqual(0);
    expect(units.redemptionRate).toBeLessThanOrEqual(1);
    expect(units.claimed + units.unclaimed).toBe(units.total);
  });
});

describe("listAuditLogs", () => {
  it("filters by action and pages through results", async () => {
    await db.auditLog.createMany({ data: Array.from({ length: 3 }, () => ({ action: `TEST_${TS}_PAGE` })) });

    const filtered = await listAuditLogs({ action: `TEST_${TS}_PAGE`, page: 1 });
    expect(filtered.rows).toHaveLength(3);
    expect(filtered.rows.every((r) => r.action === `TEST_${TS}_PAGE`)).toBe(true);
    expect(filtered.hasNext).toBe(false);

    const everything = await listAuditLogs({ page: 1 });
    expect(everything.rows.length).toBeLessThanOrEqual(AUDIT_PAGE_SIZE);
    expect(everything.rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(everything.rows[everything.rows.length - 1].createdAt.getTime());
  });
});
