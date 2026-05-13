// src/middleware.ts — Tenant resolution for RaaS routes.
import { NextResponse, type NextRequest } from "next/server";

const MATCHER_RE = /^\/(?:r|api\/r)\/([a-z0-9][a-z0-9-]{1,30}[a-z0-9]|[a-z0-9]{3})(?:\/|$)/;
const PUBLIC_RAAS_PATHS = new Set(["/r", "/r/", "/r/onboard"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass-through for non-RaaS routes.
  if (!pathname.startsWith("/r/") && !pathname.startsWith("/api/r/")) {
    return NextResponse.next();
  }

  // Public RaaS paths (no tenant binding).
  if (PUBLIC_RAAS_PATHS.has(pathname) || pathname.startsWith("/r/onboard")) {
    return NextResponse.next();
  }

  const match = MATCHER_RE.exec(pathname);
  if (!match) {
    return NextResponse.next();
  }

  const slug = match[1];

  // Tenant existence check goes through the API rather than direct KV calls
  // here, because Edge middleware can't import Node-only modules like
  // @upstash/redis directly. We do a fire-and-forget header pass and let the
  // page-level layout do the actual KV lookup with its own error handling.
  //
  // (If/when Edge KV becomes feasible — e.g. via Upstash REST adapter — this
  // can move into middleware proper for early-rejection of unknown slugs.)
  const response = NextResponse.next();
  response.headers.set("x-raas-tenant-slug", slug);
  return response;
}

export const config = {
  matcher: [
    "/r/:path*",
    "/api/r/:path*",
  ],
};
