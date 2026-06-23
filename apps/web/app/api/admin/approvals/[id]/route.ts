import { NextResponse } from "next/server";
import { requireAgentOperator, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { decideApproval } from "@/lib/approvals";

// Decide a pending approval (web). Operator-only; two-person control enforced
// (a DIFFERENT operator must approve). Approve executes the held run.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentOperator(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-approval-post", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const parsed = await readJsonLimited<{ decision?: unknown }>(request, 4 * 1024);
  if (parsed.error) return parsed.error;
  const decision = parsed.data.decision;
  if (decision !== "approve" && decision !== "deny")
    return NextResponse.json({ error: "decision must be approve or deny" }, { status: 400 });

  const res = await decideApproval({
    approvalId: id,
    decision,
    decidedById: gate.admin.id,
    decidedByEmail: gate.admin.email,
    enforceTwoPerson: true,
  });

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === "not found" ? 404 : 409 });

  await audit({
    actor: gate.admin,
    action: `agent.approval.${decision}`,
    targetType: "agent",
    summary: `${decision === "approve" ? "Approved + ran" : "Denied"} ${res.agentName ?? "a run"}`,
    req: request,
  });

  return NextResponse.json({ ok: true, status: res.status, output: res.output });
}
