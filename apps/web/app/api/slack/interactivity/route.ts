import { NextResponse } from "next/server";
import { verifySlackSignature } from "@/lib/slack";
import { decideApproval } from "@/lib/approvals";

// Slack interactive callback — the Approve/Deny buttons on an approval message
// POST here. Authenticated by the Slack request SIGNATURE (SLACK_SIGNING_SECRET),
// not a user session. Idempotent: a second click / Slack retry sees a non-pending
// approval and no-ops, so the synchronous run can't double-execute.
//
// Note: the run executes synchronously, which can exceed Slack's ~3s ack window;
// the operation still completes server-side and the approval reflects the final
// state. Two-person enforcement isn't applied here (Slack identity isn't mapped
// to operators) — the decider is recorded as the Slack user.
export async function POST(request: Request) {
  const raw = await request.text();
  const ok = verifySlackSignature(
    raw,
    request.headers.get("x-slack-request-timestamp"),
    request.headers.get("x-slack-signature"),
  );
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  // Slack sends application/x-www-form-urlencoded with a `payload` JSON field.
  let payload: {
    actions?: { action_id?: string; value?: string }[];
    user?: { username?: string; id?: string };
  };
  try {
    const params = new URLSearchParams(raw);
    payload = JSON.parse(params.get("payload") ?? "{}");
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const action = payload.actions?.[0];
  const decision = action?.action_id === "agent_approve" ? "approve" : action?.action_id === "agent_deny" ? "deny" : null;
  const approvalId = action?.value;
  if (!decision || !approvalId) return NextResponse.json({ error: "unknown action" }, { status: 400 });

  const who = `slack:${payload.user?.username ?? payload.user?.id ?? "unknown"}`;
  const res = await decideApproval({ approvalId, decision, decidedById: null, decidedByEmail: who, enforceTwoPerson: false });

  // Respond with a message that replaces the original (Slack swaps it in-place).
  const text = res.ok
    ? `${decision === "approve" ? "✅ Approved & ran" : "🚫 Denied"}: ${res.agentName ?? "run"} (by ${who})`
    : `⚠️ Couldn't ${decision}: ${res.error}`;
  return NextResponse.json({ replace_original: "true", text });
}
