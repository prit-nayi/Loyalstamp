import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { rewardCreateSchema } from "@/validators/rewards";
import { createReward, listAllRewards } from "@/services/rewardService";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ rewards: await listAllRewards() });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = rewardCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const reward = await createReward(auth.user.id, parsed.data);
  return NextResponse.json({ reward }, { status: 201 });
}
