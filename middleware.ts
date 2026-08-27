import { NextResponse, type NextRequest } from "next/server";

/**
 * Never let the browser cache authenticated API responses: without
 * Cache-Control, the HTTP cache may heuristically store them and a
 * subsequent user on the same browser could be served the previous
 * user's JSON (data leak). All /api/* responses get no-store.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
