import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { hashCoupon } from "@/lib/coupon";
import { claimCoupon } from "@/services/claimService";
import { getBalance } from "@/services/ledgerService";

// Integration tests against the real database (DATABASE_URL, CODE_HMAC_SECRET). They clean up their own rows.
const TS = Date.now();
const P = `claimtest${TS}`;
let u1 = "";
let u2 = "";

const code = (n: string) => `K${TS}${n}`;
const id = (n: string) => `${P}-${n}`;

async function makeUnit(n: string, points: number, invoiceNo?: string) {
  await db.product.create({
    data: { productId: id(n), sku: "T", name: `Test Tea ${n}`, pointsValue: points, couponHash: hashCoupon(code(n)) },
  });
  if (invoiceNo) {
    const existing = await db.invoice.findUnique({ where: { invoiceNo } });
    if (existing) await db.invoiceItem.create({ data: { productId: id(n), invoiceId: existing.invoiceId } });
    else await db.invoice.create({ data: { invoiceNo, invoiceDate: new Date(), items: { create: [{ productId: id(n) }] } } });
  }
}

beforeAll(async () => {
  u1 = (await db.user.create({ data: { email: `${P}-1@example.com`, passwordHash: "x" } })).id;
  u2 = (await db.user.create({ data: { email: `${P}-2@example.com`, passwordHash: "x" } })).id;
});

afterAll(async () => {
  const userIds = [u1, u2];
  await db.pointsLedgerEntry.deleteMany({ where: { userId: { in: userIds } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await db.invoiceItem.deleteMany({ where: { productId: { startsWith: P } } });
  await db.invoice.deleteMany({ where: { invoiceNo: { startsWith: P } } });
  await db.product.deleteMany({ where: { productId: { startsWith: P } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("claimCoupon", () => {
  it("credits the points once and marks the unit CLAIMED", async () => {
    await makeUnit("ok", 10, id("INV-OK"));
    const r = await claimCoupon({ userId: u1, invoiceNo: id("INV-OK"), couponCode: code("ok") });
    expect(r).toMatchObject({ ok: true, pointsAdded: 10, productId: id("ok") });

    const unit = await db.product.findUniqueOrThrow({ where: { productId: id("ok") } });
    expect(unit.status).toBe("CLAIMED");
    expect(unit.claimedById).toBe(u1);
    expect(unit.claimedAt).not.toBeNull();
    expect(await db.pointsLedgerEntry.count({ where: { productId: id("ok") } })).toBe(1);
  });

  it("rejects reuse of the same coupon, by the same user or another one", async () => {
    const before = await db.pointsLedgerEntry.count({ where: { productId: id("ok") } });
    expect(await claimCoupon({ userId: u1, invoiceNo: id("INV-OK"), couponCode: code("ok") })).toEqual({ ok: false });
    expect(await claimCoupon({ userId: u2, invoiceNo: id("INV-OK"), couponCode: code("ok") })).toEqual({ ok: false });
    expect(await db.pointsLedgerEntry.count({ where: { productId: id("ok") } })).toBe(before);
  });

  it("accepts the coupon typed in lower case with dashes and spaces", async () => {
    await makeUnit("fmt", 5, id("INV-FMT"));
    const typed = ` ${code("fmt").toLowerCase().replace(/^(.{4})/, "$1-")} `;
    expect((await claimCoupon({ userId: u1, invoiceNo: id("INV-FMT"), couponCode: typed })).ok).toBe(true);
  });

  it("rejects a valid coupon used with an invoice that does not list its unit", async () => {
    await makeUnit("mine", 10, id("INV-MINE"));
    await makeUnit("other", 10, id("INV-OTHER"));
    expect(await claimCoupon({ userId: u1, invoiceNo: id("INV-OTHER"), couponCode: code("mine") })).toEqual({ ok: false });
    expect((await db.product.findUniqueOrThrow({ where: { productId: id("mine") } })).status).toBe("UNUSED");
  });

  it("rejects a unit that is not on any invoice", async () => {
    await makeUnit("unsold", 10);
    expect(await claimCoupon({ userId: u1, invoiceNo: id("INV-MINE"), couponCode: code("unsold") })).toEqual({ ok: false });
    expect((await db.product.findUniqueOrThrow({ where: { productId: id("unsold") } })).status).toBe("UNUSED");
  });

  it("gives the identical result for a wrong coupon, a wrong invoice and an unknown pair", async () => {
    const wrongCoupon = await claimCoupon({ userId: u1, invoiceNo: id("INV-MINE"), couponCode: code("nope") });
    const wrongInvoice = await claimCoupon({ userId: u1, invoiceNo: id("NOPE"), couponCode: code("mine") });
    const both = await claimCoupon({ userId: u1, invoiceNo: id("NOPE"), couponCode: code("nope") });
    expect(wrongCoupon).toEqual({ ok: false });
    expect(wrongInvoice).toEqual(wrongCoupon);
    expect(both).toEqual(wrongCoupon);
  });

  it("allows exactly one winner when 10 requests race for one coupon", async () => {
    await makeUnit("race", 20, id("INV-RACE"));
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => claimCoupon({ userId: i % 2 ? u1 : u2, invoiceNo: id("INV-RACE"), couponCode: code("race") })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.pointsLedgerEntry.count({ where: { productId: id("race") } })).toBe(1);
    expect((await db.product.findUniqueOrThrow({ where: { productId: id("race") } })).status).toBe("CLAIMED");
  });

  it("rolls back the coupon if the ledger credit fails", async () => {
    await makeUnit("rb", 10, id("INV-RB"));
    // Simulate an inconsistent state: a ledger row for this unit already exists.
    await db.pointsLedgerEntry.create({ data: { userId: u2, delta: 1, reason: "ADJUSTMENT", productId: id("rb") } });

    expect(await claimCoupon({ userId: u1, invoiceNo: id("INV-RB"), couponCode: code("rb") })).toEqual({ ok: false });
    const unit = await db.product.findUniqueOrThrow({ where: { productId: id("rb") } });
    expect(unit.status).toBe("UNUSED");
    expect(unit.claimedById).toBeNull();
  });

  it("keeps the balance equal to the sum of the ledger", async () => {
    await makeUnit("b1", 7, id("INV-BAL"));
    await makeUnit("b2", 3, id("INV-BAL"));
    const before = await getBalance(u2);
    await claimCoupon({ userId: u2, invoiceNo: id("INV-BAL"), couponCode: code("b1") });
    const r = await claimCoupon({ userId: u2, invoiceNo: id("INV-BAL"), couponCode: code("b2") });
    expect(r.ok && r.balance).toBe(before + 10);

    const entries = await db.pointsLedgerEntry.findMany({ where: { userId: u2 } });
    expect(await getBalance(u2)).toBe(entries.reduce((sum, e) => sum + e.delta, 0));
  });

  it("logs failed attempts without storing the coupon", async () => {
    await claimCoupon({ userId: u1, invoiceNo: id("INV-MINE"), couponCode: code("secretwrong") });
    const logs = await db.auditLog.findMany({ where: { actorId: u1, action: "CLAIM_FAILED" } });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(code("secretwrong"));
  });
});
