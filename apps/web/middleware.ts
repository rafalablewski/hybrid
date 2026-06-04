import { NextResponse, type NextRequest } from "next/server";
import { csrfCheck } from "@hybrid/core";

// Edge middleware doing three jobs:
//
// 1. CSRF protection for the cookie-authenticated web app: every state-changing
//    /api request must carry a same-origin Origin/Referer. Bearer (mobile) calls
//    are exempt. The rule lives in @hybrid/core (tested).
//
// 2. Strict, nonce-based Content-Security-Policy on HTML responses. A fresh
//    nonce per request is injected into the request headers so Next applies it
//    to its own <script> tags, and script-src uses 'nonce' + 'strict-dynamic'
//    (the strongest XSS defense). style-src keeps 'unsafe-inline' because the UI
//    uses inline styles; fonts.googleapis/​gstatic + Supabase are allow-listed.
//
// 3. Forward-looking: an `admin.` host root is rewritten onto /admin.

function buildCsp(nonce: string, dev: boolean): string {
  const scriptSrc = dev
    ? "'self' 'unsafe-inline' 'unsafe-eval'" // Next dev/HMR needs eval; nonce is ignored alongside unsafe-inline
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- 1. CSRF on API mutations ---
  if (pathname.startsWith("/api/")) {
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

  // --- 2. Nonce + strict CSP for HTML routes ---
  const nonce = makeNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next reads the CSP from the REQUEST headers to nonce its own scripts.
  requestHeaders.set("content-security-policy", csp);

  // --- 3. admin.* host rewrite (root only) ---
  const host = (req.headers.get("host") ?? "").split(":")[0] ?? "";
  const init = { request: { headers: requestHeaders } };
  let res: NextResponse;
  if (host.startsWith("admin.") && pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    res = NextResponse.rewrite(url, init);
  } else {
    res = NextResponse.next(init);
  }
  res.headers.set("content-security-policy", csp);
  return res;
}

// Run on everything except Next's static assets + image optimizer.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
