import { NextResponse } from "next/server";
import { requireAgentOperator, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { executeAgent } from "@/lib/agent-execute";
import { recordRun } from "@/lib/agent-runs";
import { enforceBudget } from "@/lib/agent-policy";
import { rowToDefinition } from "../../agents/shared";

// Decide a pending approval. Operator-only. Two-person control: APPROVE requires
// a DIFFERENT operator than the requester, and executes the run on approval.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentOperator(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-approval-post", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const parsed = await readJsonLimited<{ decision?: unknown }>(request, 4 * 1024);
  if (parsed.error) return parsed.error;
  const decision = parsed.data.decision;
  if (decision !== "approve" && decision !== "deny")
    return NextResponse.json({ error: "decision must be approve or deny" }, { status: 400 });

  const ap = await prisma.agentApproval.findUnique({ where: { id } });
  if (!ap) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ap.status !== "pending") return NextResponse.json({ error: "already decided" }, { status: 409 });

  if (decision === "deny") {
    await prisma.agentApproval.update({
      where: { id },
      data: { status: "denied", decidedById: gate.admin.id, decidedByEmail: gate.admin.email, decidedAt: new Date() },
    });
    await audit({ actor: gate.admin, action: "agent.approval.deny", targetType: "agent", targetId: ap.agentId, summary: `Denied a run of ${ap.agentName}`, req: request });
    return NextResponse.json({ ok: true, status: "denied" });
  }

  // Two-person rule: a different operator must approve.
  if (ap.requestedByEmail && ap.requestedByEmail.toLowerCase() === gate.admin.email.toLowerCase())
    return NextResponse.json({ error: "a different operator must approve this run" }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });

  const row = await prisma.agentConfig.findUnique({ where: { id: ap.agentId } });
  if (!row) return NextResponse.json({ error: "agent no longer exists" }, { status: 404 });
  const def = rowToDefinition(row);

  if (await enforceBudget(def))
    return NextResponse.json({ error: "agent is over its 7-day budget and has been paused" }, { status: 409 });

  let roster = [def];
  try {
    const rows = await prisma.agentConfig.findMany({ where: { status: "active" } });
    roster = rows.map(rowToDefinition);
  } catch {
    /* fall back */
  }

  try {
    const result = await executeAgent({ apiKey, row, def, roster, task: ap.task });
    await recordRun({ def, task: ap.task, result, status: "ok", actor: gate.admin });
    await enforceBudget(def);
    await prisma.agentApproval.update({
      where: { id },
      data: { status: "approved", decidedById: gate.admin.id, decidedByEmail: gate.admin.email, decidedAt: new Date() },
    });
    await audit({ actor: gate.admin, action: "agent.approval.approve", targetType: "agent", targetId: ap.agentId, summary: `Approved + ran ${ap.agentName}`, metadata: { usage: result.usage }, req: request });
    return NextResponse.json({ ok: true, status: "approved", output: result.output, steps: result.steps });
  } catch (e) {
    console.error("[approval] run failed", e);
    await recordRun({ def, task: ap.task, result: { output: "(run failed)", steps: [], usage: { input: 0, output: 0 } }, status: "error", actor: gate.admin });
    return NextResponse.json({ error: "approved run failed" }, { status: 502 });
  }
}
