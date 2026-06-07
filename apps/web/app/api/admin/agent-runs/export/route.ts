import { costUsd } from "@hybrid/core";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// CSV export of the org-wide run feed. Admin-only. Optional ?status=ok|error.
// Cost is computed at each run's agent's current model list price.
function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const status = new URL(request.url).searchParams.get("status");
  const where = status === "ok" || status === "error" ? { status } : {};

  let rows: Awaited<ReturnType<typeof prisma.agentRun.findMany>> = [];
  let modelOf = new Map<string, string>();
  try {
    rows = await prisma.agentRun.findMany({ where, orderBy: { createdAt: "desc" }, take: 1000 });
    const agents = await prisma.agentConfig.findMany({ select: { id: true, model: true } });
    modelOf = new Map(agents.map((a) => [a.id, a.model]));
  } catch {
    /* tables not migrated yet → empty export */
  }

  const header = ["createdAt", "agent", "role", "runtime", "status", "delegations", "inputTokens", "outputTokens", "costUsd", "ranBy", "task"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const delegations = Array.isArray(r.steps) ? (r.steps as unknown[]).length : 0;
    const cost = costUsd(modelOf.get(r.agentId) ?? "claude-opus-4-8", r.inputTokens, r.outputTokens);
    lines.push(
      [
        r.createdAt.toISOString(),
        r.agentName,
        r.agentRole,
        r.runtime,
        r.status,
        delegations,
        r.inputTokens,
        r.outputTokens,
        cost.toFixed(4),
        r.ranByEmail ?? "",
        r.task,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const csv = lines.join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agent-runs-${status ?? "all"}-${stamp}.csv"`,
    },
  });
}
