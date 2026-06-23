import { NextResponse } from "next/server";
import { buildDigest } from "@/lib/agent-digest";
import { postSlack } from "@/lib/slack";
import { verifyBearerSecret } from "@/lib/crypto";

// Daily digest worker — hit by Vercel Cron (apps/web/vercel.json). Not admin-
// gated; authenticated by CRON_SECRET. Builds the 24h run digest and posts it to
// Slack (SLACK_WEBHOOK_URL). No-op-with-note when either is unset.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (!verifyBearerSecret(request.headers.get("authorization"), secret))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text, summary } = await buildDigest();
  const sent = await postSlack(text);
  return NextResponse.json({ sent, total: summary.total, reason: sent ? undefined : "SLACK_WEBHOOK_URL not set" });
}
