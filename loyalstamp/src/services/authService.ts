import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Role } from "@/lib/session";

const BCRYPT_ROUNDS = 10;

export type AuthUser = { id: string; email: string; role: Role };

export type RegisterResult = { ok: true; user: AuthUser } | { ok: false; code: "EMAIL_TAKEN" };
export type LoginResult = { ok: true; user: AuthUser } | { ok: false };

/** Role is never taken from input: everyone who registers is a CUSTOMER. Admins are created by seed/DB only. */
export async function registerUser(email: string, password: string, ip?: string): Promise<RegisterResult> {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const user = await db.user.create({
      data: { email: normalized, passwordHash, role: "CUSTOMER" },
      select: { id: true, email: true, role: true },
    });
    await db.auditLog.create({ data: { actorId: user.id, action: "REGISTER", ip } });
    return { ok: true, user };
  } catch (e) {
    // The unique index on email is the source of truth, which avoids a check-then-insert race.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: "EMAIL_TAKEN" };
    }
    throw e;
  }
}

let dummyHash: string | undefined;

/**
 * Same error and similar timing whether the email is unknown, the password is wrong,
 * or the account is banned, so attackers cannot tell which accounts exist.
 */
export async function authenticateUser(email: string, password: string, ip?: string): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalized } });

  dummyHash ??= await bcrypt.hash("loyalstamp-dummy-password", BCRYPT_ROUNDS);
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

  if (!user || !passwordOk) {
    await db.auditLog.create({
      data: { actorId: user?.id, action: "LOGIN_FAILED", ip, details: { email: normalized } },
    });
    return { ok: false };
  }
  if (user.status !== "ACTIVE") {
    await db.auditLog.create({ data: { actorId: user.id, action: "LOGIN_BLOCKED_BANNED", ip } });
    return { ok: false };
  }

  await db.auditLog.create({ data: { actorId: user.id, action: "LOGIN_SUCCESS", ip } });
  return { ok: true, user: { id: user.id, email: user.email, role: user.role } };
}
