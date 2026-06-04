import { NextResponse, type NextRequest } from "next/server";

// Forward-looking subdomain support. The admin console is meant to live on its
// own host (admin.hybrid.app) the way the product lives on app.hybrid.app. When
// a request arrives on an `admin.` host, we transparently serve the /admin route
// group for the bare root so the same Vercel deployment powers both. The
// server-side role guard in app/admin/layout.tsx still runs and is the real
// boundary. During testing the /admin slug works directly on any host, so this
// is purely additive and intentionally minimal (only the root is rewritten).
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0] ?? "";
  if (host.startsWith("admin.") && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
