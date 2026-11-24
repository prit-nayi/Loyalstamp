import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashCoupon } from "@/lib/coupon";
import { getBalance } from "./ledgerService";

export type ClaimResult =
  | { ok: true; productId: string; productName: string; pointsAdded: number; balance: number }
  | { ok: false }; // deliberately carries no reason: every failure looks the same to the caller

type ClaimedRow = { productId: string; name: string; pointsValue: number };

/**
 * Claims a coupon: the one place where points are earned.
 *
 * A single UPDATE decides everything at once: the coupon must exist, be UNUSED, and belong to a
 * unit listed on the given invoice. In READ COMMITTED mode (the Postgres default), if two requests
 * race for the same coupon, the second one waits for the first to finish, re-checks the
 * `status = 'UNUSED'` condition against the updated row, and matches nothing. So exactly one wins.
 *
 * The ledger credit and the audit entry are written in the same transaction. If any step fails,
 * everything rolls back and the coupon stays UNUSED.
 */
export async function claimCoupon(input: { userId: string; invoiceNo: string; couponCode: string; ip?: string }): Promise<ClaimResult> {
  const { userId, invoiceNo, couponCode, ip } = input;
  const couponHash = hashCoupon(couponCode); // throws if CODE_HMAC_SECRET is not configured

  let claimed: ClaimedRow | null = null;
  try {
    claimed = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedRow[]>`
        UPDATE products p
        SET status = 'CLAIMED', claimed_by = ${userId}, claimed_at = now()
        FROM invoice_items ii
        JOIN invoices i ON i.invoice_id = ii.invoice_id
        WHERE p.coupon_hash = ${couponHash}
          AND p.status = 'UNUSED'
          AND ii.product_id = p.product_id
          AND i.invoice_no = ${invoiceNo}
        RETURNING p.product_id AS "productId", p.name AS "name", p.points_value AS "pointsValue"`;

      if (rows.length === 0) return null;
      const row = rows[0];

      await tx.pointsLedgerEntry.create({
        data: { userId, delta: row.pointsValue, reason: "PURCHASE_CLAIM", productId: row.productId },
      });
      await tx.auditLog.create({
        data: { actorId: userId, action: "CLAIM_SUCCESS", ip, details: { productId: row.productId, points: row.pointsValue } },
      });
      return row;
    });
  } catch (e) {
    // The ledger has a unique index on product_id: a second credit for one unit is refused, and the
    // whole transaction (including the coupon update) is rolled back. Treat it as a failed claim.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    claimed = null;
  }

  if (!claimed) {
    // Record the attempt for rate limiting and fraud review. Never store the coupon itself.
    await db.auditLog.create({
      data: { actorId: userId, action: "CLAIM_FAILED", ip, details: { invoiceNo: invoiceNo.slice(0, 64) } },
    });
    return { ok: false };
  }

  return {
    ok: true,
    productId: claimed.productId,
    productName: claimed.name,
    pointsAdded: claimed.pointsValue,
    balance: await getBalance(userId),
  };
}
