import { NextResponse } from "next/server";
import { verifyUnsubscribeToken, suppress } from "@/lib/email";

// One-click unsubscribe — PUBLIC (no auth; the HMAC token is the credential).
// Linked from the footer + List-Unsubscribe header of every marketing email.
// GET shows a confirmation page; POST is for List-Unsubscribe-Post one-click.
async function handle(email: string, token: string): Promise<{ ok: boolean; message: string }> {
  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return { ok: false, message: "This unsubscribe link is invalid or has expired." };
  }
  await suppress(email, "unsubscribe");
  return { ok: true, message: `${email} has been unsubscribed from HYBRID marketing emails.` };
}

function page(message: string, ok: boolean): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>HYBRID — Unsubscribe</title></head>
    <body style="margin:0;background:#0c0d0c;color:#e9e9e9;font-family:Arial,Helvetica,sans-serif;display:grid;place-items:center;min-height:100vh;">
      <div style="max-width:480px;padding:32px;border:1px solid #2a2c2a;border-radius:16px;background:#141614;text-align:center;">
        <div style="font-weight:800;font-size:20px;margin-bottom:16px;">HYBRID<span style="color:#c6f135;">.</span></div>
        <p style="line-height:1.6;color:${ok ? "#e9e9e9" : "#ff6b6b"};">${message}</p>
      </div>
    </body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { ok, message } = await handle(url.searchParams.get("e") ?? "", url.searchParams.get("t") ?? "");
  return page(message, ok);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const { ok, message } = await handle(url.searchParams.get("e") ?? "", url.searchParams.get("t") ?? "");
  return NextResponse.json({ ok, message }, { status: ok ? 200 : 400 });
}
