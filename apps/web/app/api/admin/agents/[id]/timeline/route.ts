import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Unified activity timeline for one agent: admin actions (config edits, runs,
// approvals from the audit trail) + run records + approval records, merged and
// sorted newest-first. Admin-only. Each source read independently.
type Item = { id: string; ts: string; kind: "audit" | "run" | "approval"; title: string; detail: string; actor: string };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const { id } = await params;
  const items: Item[] = [];

  try {
    const audits = await prisma.adminAudit.findMany({
      where: { targetType: "agent", targetId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    for (const a of audits)
      items.push({ id: a.id, ts: a.createdAt.toISOString(), kind: "audit", title: a.action, detail: a.summary ?? "", actor: a.actorEmail });
  } catch {
    /* AdminAudit not present */
  }

  try {
    const runs = await prisma.agentRun.findMany({ where: { agentId: id }, orderBy: { createdAt: "desc" }, take: 50 });
    for (const r of runs)
      items.push({
        id: r.id,
        ts: r.createdAt.toISOString(),
        kind: "run",
        title: r.status === "ok" ? "Run completed" : "Run failed",
        detail: r.task,
        actor: r.ranByEmail ?? "—",
      });
  } catch {
    /* AgentRun not migrated */
  }

  try {
    const approvals = await prisma.agentApproval.findMany({ where: { agentId: id }, orderBy: { createdAt: "desc" }, take: 50 });
    for (const ap of approvals)
      items.push({
        id: ap.id,
        ts: (ap.decidedAt ?? ap.createdAt).toISOString(),
        kind: "approval",
        title: `Approval ${ap.status}`,
        detail: ap.task,
        actor: ap.decidedByEmail ?? ap.requestedByEmail ?? "—",
      });
  } catch {
    /* AgentApproval not migrated */
  }

  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return NextResponse.json({ items: items.slice(0, 80) });
}
