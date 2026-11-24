import { NextResponse, type NextRequest } from "next/server";

// When sign in is enabled (KEEL_SESSION_SECRET is set), the app needs a session.
// Without it the app runs in demo or single org dev mode and stays open.
export function proxy(request: NextRequest) {
  if (!process.env.KEEL_SESSION_SECRET) return NextResponse.next();
  if (request.cookies.has("keel_session")) return NextResponse.next();
  const to = new URL("/sign-in", request.url);
  to.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(to);
}

export const config = {
  matcher: ["/app/:path*"],
};
