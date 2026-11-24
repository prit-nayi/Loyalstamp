import { createHmac } from "node:crypto";

/**
 * Coupons are never stored in plain text. We store an HMAC-SHA256 of the
 * normalized code, keyed with a server secret (CODE_HMAC_SECRET).
 * A database leak alone therefore does not reveal usable coupons.
 */

/** Trim, uppercase, and drop spaces and hyphens so "ab-12 cd" and "AB12CD" match. */
export function normalizeCoupon(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

export function hashCoupon(raw: string, secret: string | undefined = process.env.CODE_HMAC_SECRET): string {
  if (!secret || secret.length < 16) {
    throw new Error("CODE_HMAC_SECRET is missing or too short (min 16 characters)");
  }
  return createHmac("sha256", secret).update(normalizeCoupon(raw)).digest("hex");
}
