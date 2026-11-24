import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./db";
import { SESSION_COOKIE, verifySessionToken, type Role } from "./session";

export type CurrentUser = { id: string; email: string; role: Role };

/** Reads the session cookie and loads the user from the database. Banned users are treated as logged out. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return { id: user.id, email: user.email, role: user.role };
}

type AuthResult = { ok: true; user: CurrentUser } | { ok: false; response: NextResponse };

/** Use at the top of any customer route handler. */
export async function requireUser(): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Please log in" }, { status: 401 }) };
  return { ok: true, user };
}

/** Use at the top of EVERY admin route handler. Checks the role from the database, not just the token. */
export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireUser();
  if (!result.ok) return result;
  if (result.user.role !== "ADMIN") {
    return { ok: false, response: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  }
  return result;
}
