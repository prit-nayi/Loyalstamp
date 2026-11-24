import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listActiveRewards } from "@/services/rewardService";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ rewards: await listActiveRewards() });
}
