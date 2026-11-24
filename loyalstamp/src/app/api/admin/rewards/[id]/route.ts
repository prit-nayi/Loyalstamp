import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { rewardUpdateSchema } from "@/validators/rewards";
import { updateReward } from "@/services/rewardService";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = rewardUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { id } = await params;
  const reward = await updateReward(auth.user.id, id, parsed.data);
  if (!reward) return NextResponse.json({ error: "Reward not found" }, { status: 404 });
  return NextResponse.json({ reward });
}
