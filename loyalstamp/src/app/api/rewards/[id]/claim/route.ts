import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { claimReward } from "@/services/rewardService";

const MESSAGES = {
  NOT_AVAILABLE: ["This reward is no longer available.", 404],
  OUT_OF_STOCK: ["Sorry, this reward is out of stock.", 409],
  INSUFFICIENT_POINTS: ["You do not have enough points for this reward.", 422],
} as const;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const result = await claimReward({ userId: auth.user.id, rewardId: id });
    if (!result.ok) {
      const [error, status] = MESSAGES[result.code];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ rewardName: result.rewardName, pointsSpent: result.pointsSpent, balance: result.balance });
  } catch (e) {
    console.error("Reward claim failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
