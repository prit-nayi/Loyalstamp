import { z } from "zod";

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const idText = z
  .string({ required_error: "Required" })
  .trim()
  .min(1, "Required")
  .max(64, "Too long (max 64 characters)")
  .regex(/^[A-Za-z0-9._-]+$/, "Use only letters, numbers, dot, dash and underscore");

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const productRowSchema = z.object({
  product_id: idText,
  sku: z.string({ required_error: "Required" }).trim().min(1, "Required").max(64, "Too long (max 64 characters)"),
  name: z.string({ required_error: "Required" }).trim().min(1, "Required").max(200, "Too long (max 200 characters)"),
  points_value: z
    .string({ required_error: "Required" })
    .trim()
    .regex(/^\d+$/, "Must be a whole number such as 10")
    .transform(Number)
    .pipe(z.number().int().min(1, "Must be at least 1").max(100000, "Must be at most 100000")),
  coupon_code: z.string({ required_error: "Required" }).trim().min(1, "Required").max(100, "Too long (max 100 characters)"),
});

export const invoiceRowSchema = z.object({
  invoice_no: idText,
  invoice_date: z
    .string({ required_error: "Required" })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD, for example 2026-11-01")
    .refine(isRealDate, "Not a real calendar date"),
  customer_email: z.preprocess(
    blankToUndefined,
    z.string().trim().toLowerCase().email("Enter a valid email address").max(254).optional(),
  ),
  customer_phone: z.preprocess(
    blankToUndefined,
    z.string().trim().regex(/^\+?[\d\s()-]{6,20}$/, "Enter a valid phone number").optional(),
  ),
  total_amount: z.preprocess(
    blankToUndefined,
    z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, "Use a number like 540.00").optional(),
  ),
  product_id: idText,
});

export const PRODUCT_COLUMNS = ["product_id", "sku", "name", "points_value", "coupon_code"];
export const INVOICE_COLUMNS = ["invoice_no", "invoice_date", "product_id"]; // others are optional
