import type { Role } from "./session";

/**
 * Pure routing rules, shared by middleware and tests.
 * Middleware is only the first gate: every protected route handler ALSO re-checks
 * the user in the database (see lib/auth.ts), so a bug here cannot expose admin data.
 */
export type Access = "allow" | "unauthenticated" | "forbidden";

const ADMIN_PREFIXES = ["/admin", "/api/admin"];
const LOGIN_REQUIRED_PREFIXES = ["/dashboard", "/api/claim", "/api/rewards"];

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");

export function checkAccess(pathname: string, session: { role: Role } | null): Access {
  if (ADMIN_PREFIXES.some((p) => matches(pathname, p))) {
    if (!session) return "unauthenticated";
    return session.role === "ADMIN" ? "allow" : "forbidden";
  }
  if (LOGIN_REQUIRED_PREFIXES.some((p) => matches(pathname, p))) {
    return session ? "allow" : "unauthenticated";
  }
  return "allow";
}
