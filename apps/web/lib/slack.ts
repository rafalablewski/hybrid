import crypto from "node:crypto";

// Slack integration: incoming-webhook posting (plain + Block Kit) and signed
// interactivity verification. All no-throw / config-gated.

export function slackConfigured(): boolean {
  return Boolean(process.env.SLACK_WEBHOOK_URL);
}

/** Post a plain-text message to the incoming webhook. */
export async function postSlack(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Post Block Kit blocks to the incoming webhook (for interactive buttons). */
export async function postSlackBlocks(text: string, blocks: unknown[]): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, blocks }) });
    return r.ok;
  } catch {
    return false;
  }
}

/** An approval request as an interactive Slack message (Approve / Deny buttons).
 *  The buttons POST to the app's interactivity URL → /api/slack/interactivity. */
export async function postSlackApproval(a: { id: string; agentName: string; task: string; estimateUsd: number; requestedByEmail: string | null }): Promise<boolean> {
  const est = a.estimateUsd > 0 ? ` · est $${a.estimateUsd.toFixed(2)}` : "";
  return postSlackBlocks(`Approval needed: ${a.agentName}`, [
    { type: "section", text: { type: "mrkdwn", text: `*Approval needed — ${a.agentName}*${est}\n${a.task.slice(0, 280)}\n_requested by ${a.requestedByEmail ?? "—"}_` } },
    {
      type: "actions",
      block_id: `agent_approval:${a.id}`,
      elements: [
        { type: "button", style: "primary", text: { type: "plain_text", text: "Approve & run" }, action_id: "agent_approve", value: a.id },
        { type: "button", style: "danger", text: { type: "plain_text", text: "Deny" }, action_id: "agent_deny", value: a.id },
      ],
    },
  ]);
}

/** Verify a Slack interactivity request signature (v0 HMAC-SHA256). Rejects
 *  missing config, stale timestamps (>5 min), and bad signatures. */
export function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", secret).update(base).digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
