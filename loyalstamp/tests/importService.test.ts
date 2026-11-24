import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { hashCoupon } from "@/lib/coupon";
import { importProducts, importInvoices } from "@/services/importService";

// Integration tests: they use the database in DATABASE_URL and CODE_HMAC_SECRET, and clean up their own rows.
const TS = Date.now();
const PREFIX = `imptest${TS}`;
const FILE = `${PREFIX}.csv`;
const opts = { fileName: FILE };
const pid = (n: string) => `${PREFIX}-${n}`;
const coupon = (n: string) => `C${TS}${n}`; // 13+ digits plus suffix: valid, unique per run

const productsCsv = (rows: [string, string, string, string][]) =>
  "product_id,sku,name,points_value,coupon_code\n" +
  rows.map(([id, name, pts, code]) => `${id},SKU,${name},${pts},${code}`).join("\n") + "\n";
const invoicesCsv = (rows: [string, string][]) =>
  "invoice_no,invoice_date,product_id,customer_email\n" +
  rows.map(([no, p]) => `${no},2026-11-01,${p},buyer@example.com`).join("\n") + "\n";

afterAll(async () => {
  await db.invoiceItem.deleteMany({ where: { productId: { startsWith: PREFIX } } });
  await db.invoice.deleteMany({ where: { invoiceNo: { startsWith: PREFIX } } });
  await db.product.deleteMany({ where: { productId: { startsWith: PREFIX } } });
  await db.auditLog.deleteMany({ where: { details: { path: ["fileName"], string_starts_with: PREFIX } } });
  await db.$disconnect();
});

describe("importProducts", () => {
  it("saves products and stores only the hash, never the plain coupon", async () => {
    const r = await importProducts(productsCsv([[pid("a1"), "Tea", "10", coupon("A1")]]), opts);
    expect(r).toMatchObject({ ok: true, saved: true, counts: { products: 1 } });

    const row = await db.product.findUniqueOrThrow({ where: { productId: pid("a1") } });
    expect(row.status).toBe("UNUSED");
    expect(row.couponHash).toBe(hashCoupon(coupon("A1")));
    expect(row.couponHash).toHaveLength(64);
    expect(JSON.stringify(row)).not.toContain(coupon("A1"));
  });

  it("rejects re-importing the same product and coupon, and writes nothing new", async () => {
    const r = await importProducts(productsCsv([[pid("a1"), "Tea", "10", coupon("A1")]]), opts);
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.field)).toEqual(expect.arrayContaining(["product_id", "coupon_code"]));
    expect(await db.product.count({ where: { productId: pid("a1") } })).toBe(1);
  });

  it("dry run validates but saves nothing", async () => {
    const r = await importProducts(productsCsv([[pid("dry"), "Tea", "10", coupon("DRY")]]), { ...opts, dryRun: true });
    expect(r).toMatchObject({ ok: true, saved: false, counts: { products: 1 } });
    expect(await db.product.count({ where: { productId: pid("dry") } })).toBe(0);
  });

  it("is all or nothing: one bad row means no rows are saved", async () => {
    const r = await importProducts(
      productsCsv([
        [pid("ok1"), "Tea", "10", coupon("OK1")],
        [pid("bad"), "Tea", "zero", coupon("BAD")],
      ]),
      opts,
    );
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ row: 3, field: "points_value" });
    expect(await db.product.count({ where: { productId: { startsWith: pid("ok1") } } })).toBe(0);
  });

  it("reports missing columns and empty files", async () => {
    expect((await importProducts("product_id,sku\nP1,A\n", opts)).errors[0].message).toContain("Missing column");
    expect((await importProducts("product_id,sku,name,points_value,coupon_code\n", opts)).errors[0].message).toContain("no data rows");
  });

  it("writes an audit log entry without any coupon codes", async () => {
    const logs = await db.auditLog.findMany({ where: { action: "IMPORT_PRODUCTS", details: { path: ["fileName"], string_starts_with: PREFIX } } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(logs)).not.toContain(coupon("A1"));
  });
});

describe("importInvoices", () => {
  it("creates the invoice and links its product units", async () => {
    await importProducts(productsCsv([[pid("i1"), "Tea", "10", coupon("I1")], [pid("i2"), "Tea", "10", coupon("I2")]]), opts);
    const r = await importInvoices(invoicesCsv([[pid("INV1"), pid("i1")], [pid("INV1"), pid("i2")]]), opts);
    expect(r).toMatchObject({ ok: true, saved: true, counts: { invoices: 1, items: 2 } });

    const inv = await db.invoice.findUniqueOrThrow({ where: { invoiceNo: pid("INV1") }, include: { items: true } });
    expect(inv.customerEmail).toBe("buyer@example.com");
    expect(inv.items.map((i) => i.productId).sort()).toEqual([pid("i1"), pid("i2")]);
  });

  it("rejects an unknown product and saves nothing", async () => {
    const r = await importInvoices(invoicesCsv([[pid("INV2"), pid("does-not-exist")]]), opts);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ row: 2, field: "product_id" });
    expect(await db.invoice.count({ where: { invoiceNo: pid("INV2") } })).toBe(0);
  });

  it("rejects a product unit that is already on another invoice", async () => {
    const r = await importInvoices(invoicesCsv([[pid("INV3"), pid("i1")]]), opts);
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toContain("already on another invoice");
    expect(await db.invoice.count({ where: { invoiceNo: pid("INV3") } })).toBe(0);
  });

  it("rejects an invoice number that already exists", async () => {
    await importProducts(productsCsv([[pid("i3"), "Tea", "10", coupon("I3")]]), opts);
    const r = await importInvoices(invoicesCsv([[pid("INV1"), pid("i3")]]), opts);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ field: "invoice_no" });
  });
});
