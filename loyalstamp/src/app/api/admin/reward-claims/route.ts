import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { claimStatusSchema } from "@/validators/rewards";
import { listRewardClaims } from "@/services/rewardService";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const status = claimStatusSchema.parse(new URL(req.url).searchParams.get("status") ?? "PENDING");
  return NextResponse.json({ claims: await listRewardClaims(status) });
}
