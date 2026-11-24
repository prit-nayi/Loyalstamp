import { NextResponse } from "next/server";
import { loginSchema } from "@/validators/auth";
import { authenticateUser } from "@/services/authService";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const result = await authenticateUser(parsed.data.email, parsed.data.password, ip);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createSessionToken({ userId: result.user.id, role: result.user.role });
  const res = NextResponse.json({ user: result.user });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
