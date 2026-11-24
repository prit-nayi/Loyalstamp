import { NextResponse } from "next/server";
import { registerSchema } from "@/validators/auth";
import { registerUser } from "@/services/authService";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const result = await registerUser(parsed.data.email, parsed.data.password, ip);
  if (!result.ok) {
    return NextResponse.json({ error: "This email is already registered" }, { status: 409 });
  }

  const token = await createSessionToken({ userId: result.user.id, role: result.user.role });
  const res = NextResponse.json({ user: result.user }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
