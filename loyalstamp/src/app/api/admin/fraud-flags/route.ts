import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { flagStatusSchema } from "@/validators/fraud";
import { listFlags } from "@/services/fraudService";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const status = flagStatusSchema.parse(new URL(req.url).searchParams.get("status") ?? "OPEN");
  return NextResponse.json({ flags: await listFlags(status) });
}
