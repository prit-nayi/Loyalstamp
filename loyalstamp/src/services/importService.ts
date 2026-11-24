import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { ZodIssue } from "zod";
import { db } from "@/lib/db";
import { hashCoupon, normalizeCoupon } from "@/lib/coupon";
import { parseCsv, type CsvRow } from "@/lib/csv";
import { INVOICE_COLUMNS, PRODUCT_COLUMNS, invoiceRowSchema, productRowSchema } from "@/validators/import";

/**
 * CSV import rules (see ASSUMPTIONS):
 * - All or nothing: if any row has a problem, nothing is saved and every problem is reported.
 * - Existing products and invoices are never overwritten.
 * - Plain coupon codes are hashed immediately and never stored, logged, or returned.
 */
export const MAX_ROWS = 5000;
const MAX_ERRORS_RETURNED = 100;

export type ImportError = { row: number; field?: string; message: string };

export type ImportResult = {
  ok: boolean;
  dryRun: boolean;
  saved: boolean;
  totalRows: number;
  counts: Record<string, number>;
  errorCount: number;
  errors: ImportError[]; // capped at MAX_ERRORS_RETURNED
};

export type ImportOptions = { actorId?: string; fileName?: string; dryRun?: boolean };

const rowOf = (index: number) => index + 2; // header is row 1

function issuesToErrors(row: number, issues: ZodIssue[]): ImportError[] {
  return issues.map((i) => ({ row, field: i.path.length ? String(i.path[0]) : undefined, message: i.message }));
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type ProductRecord = {
  row: number;
  productId: string;
  sku: string;
  name: string;
  pointsValue: number;
  couponHash: string;
};

/** Pure checks that need no database: field formats and duplicates inside the file. */
export function prepareProductRows(rows: CsvRow[], hashFn: (code: string) => string = hashCoupon) {
  const errors: ImportError[] = [];
  const records: ProductRecord[] = [];
  const seenIds = new Map<string, number>();
  const seenHashes = new Map<string, number>();

  rows.forEach((raw, i) => {
    const row = rowOf(i);
    const parsed = productRowSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(...issuesToErrors(row, parsed.error.issues));
      return;
    }
    const d = parsed.data;

    if (!/^[A-Z0-9]{8,64}$/.test(normalizeCoupon(d.coupon_code))) {
      errors.push({ row, field: "coupon_code", message: "Must be 8 to 64 letters or digits (spaces and dashes are ignored)" });
      return;
    }

    const couponHash = hashFn(d.coupon_code);
    let bad = false;
    const idRow = seenIds.get(d.product_id);
    if (idRow !== undefined) {
      errors.push({ row, field: "product_id", message: `Duplicate product_id, also on row ${idRow}` });
      bad = true;
    }
    const hashRow = seenHashes.get(couponHash);
    if (hashRow !== undefined) {
      // Never echo the coupon itself in an error message.
      errors.push({ row, field: "coupon_code", message: `Duplicate coupon_code, also on row ${hashRow}` });
      bad = true;
    }
    if (bad) return;

    seenIds.set(d.product_id, row);
    seenHashes.set(couponHash, row);
    records.push({ row, productId: d.product_id, sku: d.sku, name: d.name, pointsValue: d.points_value, couponHash });
  });

  return { records, errors };
}

export async function importProducts(csvText: string, opts: ImportOptions = {}, hashFn: (code: string) => string = hashCoupon): Promise<ImportResult> {
  const dryRun = !!opts.dryRun;
  const parsed = parseCsv(csvText, PRODUCT_COLUMNS);
  const early = earlyFailure(parsed, dryRun);
  if (early) return early;

  const { records, errors } = prepareProductRows(parsed.rows, hashFn);

  if (records.length) {
    const ids = records.map((r) => r.productId);
    const hashes = records.map((r) => r.couponHash);
    const [existingIds, existingHashes] = await Promise.all([
      db.product.findMany({ where: { productId: { in: ids } }, select: { productId: true } }),
      db.product.findMany({ where: { couponHash: { in: hashes } }, select: { couponHash: true } }),
    ]);
    const idSet = new Set(existingIds.map((p) => p.productId));
    const hashSet = new Set(existingHashes.map((p) => p.couponHash));
    for (const r of records) {
      if (idSet.has(r.productId)) errors.push({ row: r.row, field: "product_id", message: "product_id already exists" });
      if (hashSet.has(r.couponHash)) errors.push({ row: r.row, field: "coupon_code", message: "This coupon is already in the system" });
    }
  }

  const base = { dryRun, totalRows: parsed.rows.length };
  if (errors.length) {
    await audit("IMPORT_PRODUCTS_REJECTED", opts, { rows: parsed.rows.length, errorCount: errors.length });
    return failure(base, errors);
  }
  if (dryRun) return success(base, { products: records.length }, false);

  try {
    await db.product.createMany({
      data: records.map((r) => ({
        productId: r.productId,
        sku: r.sku,
        name: r.name,
        pointsValue: r.pointsValue,
        couponHash: r.couponHash,
      })),
    });
  } catch (e) {
    if (isUniqueViolation(e)) return failure(base, [{ row: 1, message: "Another import changed the same data. Check the file and try again." }]);
    throw e;
  }
  await audit("IMPORT_PRODUCTS", opts, { rows: parsed.rows.length, products: records.length });
  return success(base, { products: records.length }, true);
}

// ---------------------------------------------------------------------------
// Invoices (one CSV row per product unit sold)
// ---------------------------------------------------------------------------

export type InvoiceDraft = {
  invoiceNo: string;
  firstRow: number;
  date: string;
  email?: string;
  phone?: string;
  total?: string;
  items: { row: number; productId: string }[];
};

/** Pure checks: formats, rows of one invoice agreeing with each other, duplicate units in the file. */
export function prepareInvoiceRows(rows: CsvRow[]) {
  const errors: ImportError[] = [];
  const drafts = new Map<string, InvoiceDraft>();
  const seenProducts = new Map<string, number>();

  rows.forEach((raw, i) => {
    const row = rowOf(i);
    const parsed = invoiceRowSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(...issuesToErrors(row, parsed.error.issues));
      return;
    }
    const d = parsed.data;

    const seenRow = seenProducts.get(d.product_id);
    if (seenRow !== undefined) {
      errors.push({ row, field: "product_id", message: `Duplicate product_id, also on row ${seenRow}` });
      return;
    }
    seenProducts.set(d.product_id, row);

    const draft = drafts.get(d.invoice_no);
    if (!draft) {
      drafts.set(d.invoice_no, {
        invoiceNo: d.invoice_no,
        firstRow: row,
        date: d.invoice_date,
        email: d.customer_email,
        phone: d.customer_phone,
        total: d.total_amount,
        items: [{ row, productId: d.product_id }],
      });
      return;
    }

    // Same invoice on several rows: the invoice-level fields must agree (a blank means "same as above").
    const conflict = (field: string, current: string | undefined, next: string | undefined) => {
      if (next !== undefined && current !== undefined && next !== current) {
        errors.push({ row, field, message: `Differs from row ${draft.firstRow}; rows of one invoice must match` });
        return true;
      }
      return false;
    };
    const conflicts = [
      conflict("invoice_date", draft.date, d.invoice_date),
      conflict("customer_email", draft.email, d.customer_email),
      conflict("customer_phone", draft.phone, d.customer_phone),
      conflict("total_amount", draft.total, d.total_amount),
    ];
    if (conflicts.some(Boolean)) return;

    draft.email ??= d.customer_email;
    draft.phone ??= d.customer_phone;
    draft.total ??= d.total_amount;
    draft.items.push({ row, productId: d.product_id });
  });

  return { invoices: [...drafts.values()], errors };
}

export async function importInvoices(csvText: string, opts: ImportOptions = {}): Promise<ImportResult> {
  const dryRun = !!opts.dryRun;
  const parsed = parseCsv(csvText, INVOICE_COLUMNS);
  const early = earlyFailure(parsed, dryRun);
  if (early) return early;

  const { invoices, errors } = prepareInvoiceRows(parsed.rows);

  if (invoices.length) {
    const invoiceNos = invoices.map((inv) => inv.invoiceNo);
    const productIds = invoices.flatMap((inv) => inv.items.map((it) => it.productId));
    const [existingInvoices, existingProducts, linkedItems] = await Promise.all([
      db.invoice.findMany({ where: { invoiceNo: { in: invoiceNos } }, select: { invoiceNo: true } }),
      db.product.findMany({ where: { productId: { in: productIds } }, select: { productId: true } }),
      db.invoiceItem.findMany({ where: { productId: { in: productIds } }, select: { productId: true } }),
    ]);
    const invoiceSet = new Set(existingInvoices.map((x) => x.invoiceNo));
    const productSet = new Set(existingProducts.map((x) => x.productId));
    const linkedSet = new Set(linkedItems.map((x) => x.productId));

    for (const inv of invoices) {
      if (invoiceSet.has(inv.invoiceNo)) {
        errors.push({ row: inv.firstRow, field: "invoice_no", message: "invoice_no already exists" });
      }
      for (const it of inv.items) {
        if (!productSet.has(it.productId)) {
          errors.push({ row: it.row, field: "product_id", message: "Product not found. Import the products first" });
        } else if (linkedSet.has(it.productId)) {
          errors.push({ row: it.row, field: "product_id", message: "This product unit is already on another invoice" });
        }
      }
    }
  }

  const itemCount = invoices.reduce((n, inv) => n + inv.items.length, 0);
  const base = { dryRun, totalRows: parsed.rows.length };
  if (errors.length) {
    await audit("IMPORT_INVOICES_REJECTED", opts, { rows: parsed.rows.length, errorCount: errors.length });
    return failure(base, errors);
  }
  if (dryRun) return success(base, { invoices: invoices.length, items: itemCount }, false);

  const withIds = invoices.map((inv) => ({ ...inv, invoiceId: randomUUID() }));
  try {
    await db.$transaction([
      db.invoice.createMany({
        data: withIds.map((inv) => ({
          invoiceId: inv.invoiceId,
          invoiceNo: inv.invoiceNo,
          customerEmail: inv.email,
          customerPhone: inv.phone,
          invoiceDate: new Date(`${inv.date}T00:00:00Z`),
          totalAmount: inv.total,
        })),
      }),
      db.invoiceItem.createMany({
        data: withIds.flatMap((inv) => inv.items.map((it) => ({ productId: it.productId, invoiceId: inv.invoiceId }))),
      }),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) return failure(base, [{ row: 1, message: "Another import changed the same data. Check the file and try again." }]);
    throw e;
  }
  await audit("IMPORT_INVOICES", opts, { rows: parsed.rows.length, invoices: invoices.length, items: itemCount });
  return success(base, { invoices: invoices.length, items: itemCount }, true);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Base = { dryRun: boolean; totalRows: number };

function failure(base: Base, errors: ImportError[]): ImportResult {
  const sorted = [...errors].sort((a, b) => a.row - b.row);
  return { ok: false, saved: false, counts: {}, errorCount: sorted.length, errors: sorted.slice(0, MAX_ERRORS_RETURNED), ...base };
}

function success(base: Base, counts: Record<string, number>, saved: boolean): ImportResult {
  return { ok: true, saved, counts, errorCount: 0, errors: [], ...base };
}

/** Problems found before any row is looked at: missing columns, structure errors, empty or oversized file. */
function earlyFailure(parsed: ReturnType<typeof parseCsv>, dryRun: boolean): ImportResult | null {
  const base = { dryRun, totalRows: parsed.rows.length };
  if (parsed.missingColumns.length) {
    return failure(base, [{ row: 1, message: `Missing column(s): ${parsed.missingColumns.join(", ")}` }]);
  }
  if (parsed.errors.length) {
    return failure(base, parsed.errors.map((e) => ({ row: e.row, message: e.message })));
  }
  if (parsed.rows.length === 0) return failure(base, [{ row: 1, message: "The file has no data rows" }]);
  if (parsed.rows.length > MAX_ROWS) {
    return failure(base, [{ row: 1, message: `Too many rows (${parsed.rows.length}). The limit is ${MAX_ROWS} per file; split the file` }]);
  }
  return null;
}

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Never put coupon codes in audit details: counts and the file name only. */
async function audit(action: string, opts: ImportOptions, details: Record<string, number>) {
  await db.auditLog.create({
    data: { actorId: opts.actorId, action, details: { fileName: opts.fileName ?? null, ...details } },
  });
}
