import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { resolveFlagSchema } from "@/validators/fraud";
import { resolveFlag } from "@/services/fraudService";

const MESSAGES = {
  NOT_FOUND: ["Flag not found", 404],
  ALREADY_RESOLVED: ["This flag was already resolved", 409],
  NO_USER_TO_BAN: ["This flag is not linked to a user, so there is nobody to ban", 400],
  CANNOT_BAN_ADMIN: ["Admin accounts cannot be banned here", 400],
} as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = resolveFlagSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { id } = await params;
  const result = await resolveFlag({ flagId: id, adminId: auth.user.id, ...parsed.data });
  if (!result.ok) {
    const [error, status] = MESSAGES[result.code];
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ ok: true, banned: result.banned });
}
