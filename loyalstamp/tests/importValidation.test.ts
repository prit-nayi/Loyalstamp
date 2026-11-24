import { describe, it, expect } from "vitest";
import { normalizeCoupon } from "@/lib/coupon";
import { prepareProductRows, prepareInvoiceRows } from "@/services/importService";

const hashFn = (c: string) => "h:" + normalizeCoupon(c);
const product = (o: Record<string, string> = {}) => ({
  product_id: "P-1",
  sku: "TEA",
  name: "Tea",
  points_value: "10",
  coupon_code: "ABCD-1234",
  ...o,
});
const invoiceRow = (o: Record<string, string> = {}) => ({
  invoice_no: "INV-1",
  invoice_date: "2026-11-01",
  product_id: "P-1",
  customer_email: "",
  customer_phone: "",
  total_amount: "",
  ...o,
});

describe("prepareProductRows", () => {
  it("accepts a valid row and hashes the coupon", () => {
    const r = prepareProductRows([product()], hashFn);
    expect(r.errors).toEqual([]);
    expect(r.records[0]).toMatchObject({ productId: "P-1", pointsValue: 10, couponHash: "h:ABCD1234" });
  });

  it("reports required fields with spreadsheet row numbers (first data row = 2)", () => {
    const r = prepareProductRows([product(), product({ product_id: "P-2", coupon_code: "WXYZ-9876", name: "" })], hashFn);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ row: 3, field: "name" });
  });

  it.each(["0", "-5", "abc", "1.5", "", "100001"])("rejects points_value %j", (v) => {
    expect(prepareProductRows([product({ points_value: v })], hashFn).errors.length).toBeGreaterThan(0);
  });

  it("rejects coupons that are too short or contain symbols", () => {
    expect(prepareProductRows([product({ coupon_code: "AB12" })], hashFn).errors[0].field).toBe("coupon_code");
    expect(prepareProductRows([product({ coupon_code: "ABCD!@#$1234" })], hashFn).errors[0].field).toBe("coupon_code");
  });

  it("rejects an unsafe product_id", () => {
    expect(prepareProductRows([product({ product_id: "P 1;DROP" })], hashFn).errors[0].field).toBe("product_id");
  });

  it("detects duplicate product_id inside the file", () => {
    const r = prepareProductRows([product(), product({ coupon_code: "WXYZ-9876" })], hashFn);
    expect(r.errors).toEqual([expect.objectContaining({ row: 3, field: "product_id" })]);
  });

  it("detects the same coupon typed in a different format, without echoing it", () => {
    const r = prepareProductRows([product(), product({ product_id: "P-2", coupon_code: "abcd1234" })], hashFn);
    expect(r.errors).toEqual([expect.objectContaining({ row: 3, field: "coupon_code" })]);
    expect(JSON.stringify(r.errors).toUpperCase()).not.toContain("ABCD1234");
  });
});

describe("prepareInvoiceRows", () => {
  it("groups rows with the same invoice_no into one invoice", () => {
    const r = prepareInvoiceRows([invoiceRow(), invoiceRow({ product_id: "P-2" }), invoiceRow({ invoice_no: "INV-2", product_id: "P-3" })]);
    expect(r.errors).toEqual([]);
    expect(r.invoices).toHaveLength(2);
    expect(r.invoices[0].items.map((i) => i.productId)).toEqual(["P-1", "P-2"]);
  });

  it("lets later rows leave invoice details blank, and inherits them", () => {
    const r = prepareInvoiceRows([invoiceRow({ customer_email: "A@B.com", total_amount: "100.50" }), invoiceRow({ product_id: "P-2" })]);
    expect(r.errors).toEqual([]);
    expect(r.invoices[0]).toMatchObject({ email: "a@b.com", total: "100.50" });
  });

  it("rejects rows of one invoice that disagree", () => {
    const r = prepareInvoiceRows([invoiceRow(), invoiceRow({ product_id: "P-2", invoice_date: "2026-11-02" })]);
    expect(r.errors).toEqual([expect.objectContaining({ row: 3, field: "invoice_date" })]);
  });

  it("rejects bad dates, emails, amounts and phones", () => {
    for (const bad of [
      { invoice_date: "2026-02-30" },
      { invoice_date: "01/11/2026" },
      { customer_email: "nope" },
      { total_amount: "12,50" },
      { customer_phone: "abc" },
    ]) {
      expect(prepareInvoiceRows([invoiceRow(bad)]).errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects the same product unit twice in one file", () => {
    const r = prepareInvoiceRows([invoiceRow(), invoiceRow({ invoice_no: "INV-2" })]);
    expect(r.errors).toEqual([expect.objectContaining({ row: 3, field: "product_id" })]);
  });
});
