import { NextResponse } from "next/server";
import { requireAdmin, requireAgentOperator, audit } from "@/lib/admin";
import { rateLimit } from "@/lib/guard";
import { buildDigest } from "@/lib/agent-digest";
import { postSlack, slackConfigured } from "@/lib/slack";

// Preview the current digest (admin) and send it to Slack on demand (operator).
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { text, summary } = await buildDigest();
  return NextResponse.json({ text, summary, slackConfigured: slackConfigured() });
}

export async function POST(request: Request) {
  const gate = await requireAgentOperator(request);
  if (gate.error) return gate.error;
  const limited = await rateLimit(request, { key: "admin-digest-send", limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { text } = await buildDigest();
  const sent = await postSlack(text);

  await audit({
    actor: gate.admin,
    action: "agent.digest.send",
    summary: `Sent the agent digest to Slack${sent ? "" : " — Slack not configured"}`,
    metadata: { sent },
    req: request,
  });

  return NextResponse.json({ sent, reason: sent ? undefined : "SLACK_WEBHOOK_URL not set" });
}
