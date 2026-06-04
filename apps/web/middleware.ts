import { NextResponse, type NextRequest } from "next/server";
import { csrfCheck } from "@hybrid/core";

// Edge middleware doing two jobs:
//
// 1. CSRF protection (the real boundary for the cookie-authenticated web app):
//    every state-changing /api request must carry a same-origin Origin/Referer.
//    Cross-origin forgeries are rejected with 403 before they reach a route.
//    Mobile's Bearer-token calls are exempt — a token isn't sent ambiently, so
//    it can't be forged this way. The rule lives in @hybrid/core (tested).
//
// 2. Forward-looking subdomain support: an `admin.` host root is rewritten onto
//    the /admin route group so the same deployment can power admin.hybrid.app.
//    The server-side role guard in app/admin/layout.tsx is still the real gate.
export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  if (url.pathname.startsWith("/api/")) {
    const auth = req.headers.get("authorization") ?? "";
    const decision = csrfCheck({
      method: req.method,
      hasBearer: auth.toLowerCase().startsWith("bearer "),
      origin: req.headers.get("origin"),
      referer: req.headers.get("referer"),
      host: req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
    });
    if (!decision.ok) {
      return NextResponse.json({ error: "csrf_check_failed", reason: decision.reason }, { status: 403 });
    }
    return NextResponse.next();
  }

  const host = (req.headers.get("host") ?? "").split(":")[0] ?? "";
  if (host.startsWith("admin.") && url.pathname === "/") {
    const rewrite = url.clone();
    rewrite.pathname = "/admin";
    return NextResponse.rewrite(rewrite);
  }

  return NextResponse.next();
}

export const config = { matcher: ["/", "/api/:path*"] };
