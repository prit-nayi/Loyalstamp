import { SignJWT, jwtVerify } from "jose";

/**
 * Session = a signed JWT (HS256) kept in an httpOnly cookie.
 * This file avoids Node-only APIs so it also runs in Next.js middleware (edge runtime).
 */
export const SESSION_COOKIE = "ls_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type Role = "CUSTOMER" | "ADMIN";
export type SessionPayload = { userId: string; role: Role };

function secretKey(secret: string | undefined = process.env.AUTH_SECRET): Uint8Array {
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (min 16 characters)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload, secret?: string): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey(secret));
}

/** Returns the payload, or null if the token is missing, forged, expired or malformed (fails closed). */
export async function verifySessionToken(token: string | undefined, secret?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sub !== "string" || (role !== "CUSTOMER" && role !== "ADMIN")) return null;
    return { userId: payload.sub, role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
