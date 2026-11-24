import { NextResponse, type NextRequest } from "next/server";
import { checkAccess } from "@/lib/access";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// First gate only. Route handlers and pages re-check the user against the database.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const access = checkAccess(pathname, session);

  if (access === "allow") return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: access === "unauthenticated" ? "Please log in" : "Not allowed" },
      { status: access === "unauthenticated" ? 401 : 403 },
    );
  }
  const target = access === "unauthenticated" ? "/login" : "/dashboard";
  return NextResponse.redirect(new URL(target, req.url));
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/:path*"],
};
