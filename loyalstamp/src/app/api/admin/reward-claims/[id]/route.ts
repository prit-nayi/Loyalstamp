import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { claimActionSchema } from "@/validators/rewards";
import { cancelRewardClaim, fulfillRewardClaim } from "@/services/rewardService";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = claimActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Action must be FULFILL or CANCEL" }, { status: 400 });

  const { id } = await params;
  const result = parsed.data.action === "FULFILL" ? await fulfillRewardClaim(auth.user.id, id) : await cancelRewardClaim(auth.user.id, id);
  if (!result.ok) {
    return result.code === "NOT_FOUND"
      ? NextResponse.json({ error: "Reward request not found" }, { status: 404 })
      : NextResponse.json({ error: "This request is no longer pending" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
