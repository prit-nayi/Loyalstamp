import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { hashCoupon } from "@/lib/coupon";
import type { FraudConfig } from "@/lib/fraudConfig";
import { claimWithProtection, getClaimLock, getLoginLock, resolveFlag } from "@/services/fraudService";

// Integration tests against the real database. They clean up their own rows.
const TS = Date.now();
const P = `fraud${TS}`;
const IP = (n: string) => `ip-${P}-${n}`;
const code = (n: string) => `F${TS}${n}`;
const id = (n: string) => `${P}-${n}`;
const cfg: FraudConfig = { maxFailedAttempts: 3, lockoutMinutes: 15, maxAccountsPerIp: 3, maxClaimsPerHour: 2 };
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

const userIds: string[] = [];
async function mkUser(n: string, role: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  const u = await db.user.create({ data: { email: `${P}-${n}@example.com`, passwordHash: "x", role } });
  userIds.push(u.id);
  return u.id;
}
async function seed(action: string, n: number, data: { actorId?: string; ip?: string; email?: string; minutesAgo?: number | number[] }) {
  await db.auditLog.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      action,
      actorId: data.actorId,
      ip: data.ip,
      details: data.email ? { email: data.email } : undefined,
      createdAt: minutesAgo(Array.isArray(data.minutesAgo) ? data.minutesAgo[i] : (data.minutesAgo ?? 1)),
    })),
  });
}
async function mkUnit(n: string, points: number, invoiceNo: string) {
  await db.product.create({ data: { productId: id(n), sku: "T", name: `Fraud Tea ${n}`, pointsValue: points, couponHash: hashCoupon(code(n)) } });
  const inv = await db.invoice.findUnique({ where: { invoiceNo } });
  if (inv) await db.invoiceItem.create({ data: { productId: id(n), invoiceId: inv.invoiceId } });
  else await db.invoice.create({ data: { invoiceNo, invoiceDate: new Date(), items: { create: [{ productId: id(n) }] } } });
}
const openFlags = (where: object) => db.auditLog.findMany({ where: { category: "FRAUD_FLAG", flagStatus: "OPEN", ...where } });

afterAll(async () => {
  await db.pointsLedgerEntry.deleteMany({ where: { userId: { in: userIds } } });
  await db.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { ip: { startsWith: `ip-${P}` } }, { details: { path: ["email"], string_starts_with: P } }] },
  });
  await db.invoiceItem.deleteMany({ where: { productId: { startsWith: P } } });
  await db.invoice.deleteMany({ where: { invoiceNo: { startsWith: P } } });
  await db.product.deleteMany({ where: { productId: { startsWith: P } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("getClaimLock", () => {
  it("does not lock below the limit, and locks at the limit", async () => {
    const a = await mkUser("lock-a");
    await seed("CLAIM_FAILED", 2, { actorId: a });
    expect((await getClaimLock({ userId: a }, cfg)).locked).toBe(false);
    await seed("CLAIM_FAILED", 1, { actorId: a });
    expect((await getClaimLock({ userId: a }, cfg)).locked).toBe(true);
  });

  it("ignores failures that are older than the window", async () => {
    const b = await mkUser("lock-b");
    await seed("CLAIM_FAILED", 5, { actorId: b, minutesAgo: 20 });
    expect((await getClaimLock({ userId: b }, cfg)).locked).toBe(false);
  });

  it("reports when the lock ends: when the oldest counted failure leaves the window", async () => {
    const c = await mkUser("lock-c");
    await seed("CLAIM_FAILED", 3, { actorId: c, minutesAgo: [1, 5, 10] });
    const lock = await getClaimLock({ userId: c }, cfg);
    expect(lock.locked).toBe(true);
    if (lock.locked) {
      expect(lock.retryAfterSeconds).toBeGreaterThan(295);
      expect(lock.retryAfterSeconds).toBeLessThanOrEqual(301); // 10 min ago + 15 min window = 5 min left
    }
  });

  it("locks an IP after 4x the per-user limit, whoever the users are", async () => {
    const d = await mkUser("lock-d");
    await seed("CLAIM_FAILED", 11, { ip: IP("busy") });
    expect((await getClaimLock({ userId: d, ip: IP("busy") }, cfg)).locked).toBe(false);
    await seed("CLAIM_FAILED", 1, { ip: IP("busy") });
    expect((await getClaimLock({ userId: d, ip: IP("busy") }, cfg)).locked).toBe(true);
  });
});

describe("getLoginLock", () => {
  it("locks an email after repeated failed logins, case-insensitively", async () => {
    const email = `${P}-login@example.com`;
    await seed("LOGIN_FAILED", 3, { email });
    expect((await getLoginLock({ email: email.toUpperCase() }, cfg)).locked).toBe(true);
    expect((await getLoginLock({ email: `${P}-other@example.com` }, cfg)).locked).toBe(false);
  });
});

describe("claimWithProtection", () => {
  it("blocks a locked user even when the coupon is valid, and does not extend the lock", async () => {
    const u = await mkUser("blocked");
    await mkUnit("blk", 10, id("INV-BLK"));
    await seed("CLAIM_FAILED", 3, { actorId: u });

    const r = await claimWithProtection({ userId: u, invoiceNo: id("INV-BLK"), couponCode: code("blk") }, cfg);
    expect(r).toMatchObject({ ok: false, blocked: true });
    expect((await db.product.findUniqueOrThrow({ where: { productId: id("blk") } })).status).toBe("UNUSED");
    expect(await db.auditLog.count({ where: { actorId: u, action: "CLAIM_FAILED" } })).toBe(3); // unchanged
    expect(await db.auditLog.count({ where: { actorId: u, action: "CLAIM_BLOCKED" } })).toBe(1);
  });

  it("locks after repeated wrong guesses, raises one flag, and blocks the next attempt", async () => {
    const u = await mkUser("guesser");
    const attempt = () => claimWithProtection({ userId: u, invoiceNo: id("NOPE"), couponCode: code("wrong") }, cfg);

    for (let i = 0; i < 3; i++) expect(await attempt()).toEqual({ ok: false, blocked: false });
    expect(await attempt()).toMatchObject({ ok: false, blocked: true });
    await attempt();

    const flags = await openFlags({ actorId: u, action: "REPEATED_FAILURES" });
    expect(flags).toHaveLength(1); // deduplicated
  });

  it("lets a normal user claim", async () => {
    const u = await mkUser("normal");
    await mkUnit("nrm", 10, id("INV-NRM"));
    const r = await claimWithProtection({ userId: u, invoiceNo: id("INV-NRM"), couponCode: code("nrm") }, cfg);
    expect(r).toMatchObject({ ok: true, pointsAdded: 10 });
  });

  it("flags many accounts using claims from one IP", async () => {
    const ip = IP("shared");
    const [a, b, c] = [await mkUser("ip1"), await mkUser("ip2"), await mkUser("ip3")];
    // Two other accounts already made claim attempts from this IP; the third attempt triggers the rule.
    await seed("CLAIM_FAILED", 1, { actorId: b, ip });
    await seed("CLAIM_FAILED", 1, { actorId: c, ip });
    expect(await openFlags({ ip, action: "MANY_ACCOUNTS_ONE_IP" })).toHaveLength(0);

    await claimWithProtection({ userId: a, invoiceNo: id("NOPE"), couponCode: code("wrong"), ip }, { ...cfg, maxFailedAttempts: 10 });
    await claimWithProtection({ userId: a, invoiceNo: id("NOPE"), couponCode: code("wrong"), ip }, { ...cfg, maxFailedAttempts: 10 });

    expect(await openFlags({ ip, action: "MANY_ACCOUNTS_ONE_IP" })).toHaveLength(1); // raised once, not twice
  });

  it("flags unusually high claim volume", async () => {
    const u = await mkUser("volume");
    await mkUnit("v1", 5, id("INV-VOL"));
    await mkUnit("v2", 5, id("INV-VOL"));
    await claimWithProtection({ userId: u, invoiceNo: id("INV-VOL"), couponCode: code("v1") }, cfg);
    expect(await openFlags({ actorId: u, action: "HIGH_CLAIM_VOLUME" })).toHaveLength(0);
    await claimWithProtection({ userId: u, invoiceNo: id("INV-VOL"), couponCode: code("v2") }, cfg);
    expect(await openFlags({ actorId: u, action: "HIGH_CLAIM_VOLUME" })).toHaveLength(1);
  });
});

describe("resolveFlag", () => {
  const mkFlag = (actorId?: string) =>
    db.auditLog.create({ data: { category: "FRAUD_FLAG", action: "TEST_FLAG", flagStatus: "OPEN", actorId, ip: actorId ? undefined : IP("flag") } });

  it("dismisses a flag without banning", async () => {
    const admin = await mkUser("adm1", "ADMIN");
    const cust = await mkUser("c1");
    const flag = await mkFlag(cust);
    expect(await resolveFlag({ flagId: flag.id, adminId: admin, decision: "DISMISSED" })).toEqual({ ok: true, banned: false });
    expect((await db.auditLog.findUniqueOrThrow({ where: { id: flag.id } })).flagStatus).toBe("DISMISSED");
    expect((await db.user.findUniqueOrThrow({ where: { id: cust } })).status).toBe("ACTIVE");
  });

  it("confirms a flag and bans the customer, and records the admin action", async () => {
    const admin = await mkUser("adm2", "ADMIN");
    const cust = await mkUser("c2");
    const flag = await mkFlag(cust);
    expect(await resolveFlag({ flagId: flag.id, adminId: admin, decision: "CONFIRMED", banUser: true })).toEqual({ ok: true, banned: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: cust } })).status).toBe("BANNED");
    expect(await db.auditLog.count({ where: { actorId: admin, action: "ADMIN_RESOLVE_FLAG" } })).toBe(1);
  });

  it("refuses to ban an admin, and changes nothing", async () => {
    const admin = await mkUser("adm3", "ADMIN");
    const other = await mkUser("adm4", "ADMIN");
    const flag = await mkFlag(other);
    expect(await resolveFlag({ flagId: flag.id, adminId: admin, decision: "CONFIRMED", banUser: true })).toEqual({ ok: false, code: "CANNOT_BAN_ADMIN" });
    expect((await db.auditLog.findUniqueOrThrow({ where: { id: flag.id } })).flagStatus).toBe("OPEN");
    expect((await db.user.findUniqueOrThrow({ where: { id: other } })).status).toBe("ACTIVE");
  });

  it("cannot ban from a flag that has no user, and cannot resolve twice", async () => {
    const admin = await mkUser("adm5", "ADMIN");
    const ipFlag = await mkFlag();
    expect(await resolveFlag({ flagId: ipFlag.id, adminId: admin, decision: "CONFIRMED", banUser: true })).toEqual({ ok: false, code: "NO_USER_TO_BAN" });
    expect(await resolveFlag({ flagId: ipFlag.id, adminId: admin, decision: "DISMISSED" })).toEqual({ ok: true, banned: false });
    expect(await resolveFlag({ flagId: ipFlag.id, adminId: admin, decision: "DISMISSED" })).toEqual({ ok: false, code: "ALREADY_RESOLVED" });
    expect(await resolveFlag({ flagId: "does-not-exist", adminId: admin, decision: "DISMISSED" })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});
