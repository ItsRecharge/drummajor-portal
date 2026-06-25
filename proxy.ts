import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 renamed middleware.ts -> proxy.ts. This is a LIGHT gate: it only
// checks for the presence of the session cookie and bounces unauthenticated
// requests to /login. Real session validation and role authz happen in the (app)
// layout and Server Actions via requireAuth/requireRole (see src/lib/auth.ts).
const SESSION_COOKIE = "dm_session";

export function proxy(request: NextRequest) {
  if (!request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/invites/:path*",
    "/rosters/:path*",
    "/announcements/:path*",
    "/music/:path*",
    "/events/:path*",
    "/tasks/:path*",
    "/notes/:path*",
    "/vault/:path*",
    "/handoff/:path*",
    "/audit/:path*",
    "/notifications/:path*",
  ],
};
