import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { claimSchema } from "@/validators/claim";
import { claimCoupon } from "@/services/claimService";

const NO_MATCH = "No match found. Check the invoice number and the coupon code and try again.";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter both the invoice number and the coupon code." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  try {
    const result = await claimCoupon({
      userId: auth.user.id,
      invoiceNo: parsed.data.invoiceNo,
      couponCode: parsed.data.couponCode,
      ip,
    });
    if (!result.ok) return NextResponse.json({ error: NO_MATCH }, { status: 422 }); // same answer for every failure
    return NextResponse.json({
      pointsAdded: result.pointsAdded,
      productName: result.productName,
      balance: result.balance,
    });
  } catch (e) {
    console.error("Claim failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
