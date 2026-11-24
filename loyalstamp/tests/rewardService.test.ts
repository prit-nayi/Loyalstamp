import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { getBalance } from "@/services/ledgerService";
import { cancelRewardClaim, claimReward, createReward, fulfillRewardClaim, updateReward } from "@/services/rewardService";

// Integration tests against the real database. They clean up their own rows.
const TS = Date.now();
const P = `rwdtest${TS}`;
const userIds: string[] = [];

async function mkUser(n: string, points = 0, role: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  const u = await db.user.create({ data: { email: `${P}-${n}@example.com`, passwordHash: "x", role } });
  userIds.push(u.id);
  if (points) await db.pointsLedgerEntry.create({ data: { userId: u.id, delta: points, reason: "ADJUSTMENT", note: "test setup" } });
  return u.id;
}
const mkReward = (n: string, pointsCost: number, stock: number, active = true) =>
  db.reward.create({ data: { name: `${P}-${n}`, pointsCost, stock, active } });
const stockOf = async (id: string) => (await db.reward.findUniqueOrThrow({ where: { id } })).stock;

afterAll(async () => {
  await db.pointsLedgerEntry.deleteMany({ where: { userId: { in: userIds } } });
  await db.rewardClaim.deleteMany({ where: { userId: { in: userIds } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await db.reward.deleteMany({ where: { name: { startsWith: P } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("claimReward", () => {
  it("spends points, lowers stock, and creates a PENDING request", async () => {
    const u = await mkUser("ok", 100);
    const r = await mkReward("ok", 60, 3);
    const res = await claimReward({ userId: u, rewardId: r.id });
    expect(res).toMatchObject({ ok: true, pointsSpent: 60, balance: 40 });

    expect(await getBalance(u)).toBe(40);
    expect(await stockOf(r.id)).toBe(2);
    const claim = await db.rewardClaim.findFirstOrThrow({ where: { userId: u, rewardId: r.id } });
    expect(claim).toMatchObject({ status: "PENDING", pointsSpent: 60 });
    const spend = await db.pointsLedgerEntry.findFirstOrThrow({ where: { rewardClaimId: claim.id } });
    expect(spend).toMatchObject({ delta: -60, reason: "REWARD_SPEND" });
  });

  it("refuses when points are not enough, and changes nothing", async () => {
    const u = await mkUser("poor", 10);
    const r = await mkReward("poor", 60, 3);
    expect(await claimReward({ userId: u, rewardId: r.id })).toEqual({ ok: false, code: "INSUFFICIENT_POINTS" });
    expect(await stockOf(r.id)).toBe(3);
    expect(await getBalance(u)).toBe(10);
    expect(await db.rewardClaim.count({ where: { userId: u } })).toBe(0);
  });

  it("refuses when out of stock", async () => {
    const u = await mkUser("nostock", 100);
    const r = await mkReward("nostock", 10, 0);
    expect(await claimReward({ userId: u, rewardId: r.id })).toEqual({ ok: false, code: "OUT_OF_STOCK" });
    expect(await getBalance(u)).toBe(100);
  });

  it("refuses an inactive or unknown reward", async () => {
    const u = await mkUser("inactive", 100);
    const r = await mkReward("inactive", 10, 5, false);
    expect(await claimReward({ userId: u, rewardId: r.id })).toEqual({ ok: false, code: "NOT_AVAILABLE" });
    expect(await claimReward({ userId: u, rewardId: "does-not-exist" })).toEqual({ ok: false, code: "NOT_AVAILABLE" });
  });

  it("gives the last unit to exactly one of five users who ask at once", async () => {
    const r = await mkReward("last", 10, 1);
    const users = await Promise.all(["l1", "l2", "l3", "l4", "l5"].map((n) => mkUser(n, 50)));
    const results = await Promise.all(users.map((userId) => claimReward({ userId, rewardId: r.id })));

    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect(results.filter((x) => !x.ok).every((x) => !x.ok && x.code === "OUT_OF_STOCK")).toBe(true);
    expect(await stockOf(r.id)).toBe(0);
    expect(await db.rewardClaim.count({ where: { rewardId: r.id } })).toBe(1);
  });

  it("does not let one user overspend by sending five requests at once", async () => {
    const u = await mkUser("double", 100);
    const r = await mkReward("double", 80, 10);
    const results = await Promise.all(Array.from({ length: 5 }, () => claimReward({ userId: u, rewardId: r.id })));

    expect(results.filter((x) => x.ok)).toHaveLength(1); // 100 points buys one 80-point reward, not two
    expect(await getBalance(u)).toBe(20);
    expect(await stockOf(r.id)).toBe(9);
  });
});

describe("fulfil and cancel", () => {
  it("fulfils a pending request once", async () => {
    const admin = await mkUser("adm1", 0, "ADMIN");
    const u = await mkUser("ful", 100);
    const r = await mkReward("ful", 30, 2);
    const claim = await claimReward({ userId: u, rewardId: r.id });
    if (!claim.ok) throw new Error("setup failed");

    expect(await fulfillRewardClaim(admin, claim.claimId)).toEqual({ ok: true });
    const row = await db.rewardClaim.findUniqueOrThrow({ where: { id: claim.claimId } });
    expect(row.status).toBe("FULFILLED");
    expect(row.fulfilledAt).not.toBeNull();

    expect(await fulfillRewardClaim(admin, claim.claimId)).toEqual({ ok: false, code: "NOT_PENDING" });
    expect(await cancelRewardClaim(admin, claim.claimId)).toEqual({ ok: false, code: "NOT_PENDING" }); // too late to cancel
    expect(await getBalance(u)).toBe(70); // no refund happened
  });

  it("cancels a pending request: points come back, stock is restored, and only once", async () => {
    const admin = await mkUser("adm2", 0, "ADMIN");
    const u = await mkUser("can", 100);
    const r = await mkReward("can", 30, 2);
    const claim = await claimReward({ userId: u, rewardId: r.id });
    if (!claim.ok) throw new Error("setup failed");
    expect(await getBalance(u)).toBe(70);

    expect(await cancelRewardClaim(admin, claim.claimId)).toEqual({ ok: true });
    expect(await getBalance(u)).toBe(100);
    expect(await stockOf(r.id)).toBe(2);
    expect((await db.rewardClaim.findUniqueOrThrow({ where: { id: claim.claimId } })).status).toBe("CANCELLED");

    // A second cancel (or two at the same moment) must not refund again.
    const again = await Promise.all([cancelRewardClaim(admin, claim.claimId), cancelRewardClaim(admin, claim.claimId)]);
    expect(again.every((x) => !x.ok)).toBe(true);
    expect(await getBalance(u)).toBe(100);
    expect(await stockOf(r.id)).toBe(2);
  });

  it("reports an unknown request", async () => {
    const admin = await mkUser("adm3", 0, "ADMIN");
    expect(await fulfillRewardClaim(admin, "nope")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await cancelRewardClaim(admin, "nope")).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("keeps the balance equal to the sum of the ledger after a mix of actions", async () => {
    const admin = await mkUser("adm4", 0, "ADMIN");
    const u = await mkUser("mix", 200);
    const r = await mkReward("mix", 50, 5);
    const a = await claimReward({ userId: u, rewardId: r.id });
    await claimReward({ userId: u, rewardId: r.id });
    if (a.ok) await cancelRewardClaim(admin, a.claimId);

    const entries = await db.pointsLedgerEntry.findMany({ where: { userId: u } });
    expect(await getBalance(u)).toBe(entries.reduce((s, e) => s + e.delta, 0));
    expect(await getBalance(u)).toBe(150);
  });
});

describe("admin catalog", () => {
  it("creates and updates rewards and writes audit entries", async () => {
    const admin = await mkUser("adm5", 0, "ADMIN");
    const created = await createReward(admin, { name: `${P}-cat`, description: "x", pointsCost: 20, stock: 4, active: true });
    expect(created).toMatchObject({ pointsCost: 20, stock: 4, active: true });

    const updated = await updateReward(admin, created.id, { stock: 9, active: false });
    expect(updated).toMatchObject({ stock: 9, active: false, pointsCost: 20 });
    expect(await updateReward(admin, "missing", { stock: 1 })).toBeNull();

    const actions = (await db.auditLog.findMany({ where: { actorId: admin } })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["REWARD_CREATE", "REWARD_UPDATE"]));
  });
});
