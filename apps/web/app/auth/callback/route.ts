import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (Apple/Google) redirect lands here. Exchange the code for a session
// cookie, then send the operator on to the admin panel.
/** Only allow a same-origin RELATIVE path as the post-login redirect. Rejects
 *  absolute URLs, protocol-relative `//host`, and the `@host` userinfo trick
 *  (e.g. `next=@evil.com` → `${origin}@evil.com` resolves to host `evil.com`).
 *  Anything else falls back to /admin — the only signed-in web surface. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/admin";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
