import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap gate: signed-out visitors to /app go to /login. The session itself is
 * verified against the database in the app layout and in every API route.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("jarvis_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*"] };
