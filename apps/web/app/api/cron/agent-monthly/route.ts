import { NextResponse } from "next/server";
import { costUsd } from "@hybrid/core";
import { prisma } from "@/lib/db";
import { postSlack } from "@/lib/slack";

// Monthly cost report worker — Vercel Cron on the 1st (apps/web/vercel.json).
// CRON_SECRET-authenticated. Posts the PREVIOUS month's per-agent spend to Slack.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;

  let total = 0;
  const byAgent = new Map<string, { runs: number; cost: number }>();
  let runs = 0;
  try {
    const rows = await prisma.agentRun.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { agentId: true, agentName: true, inputTokens: true, outputTokens: true } });
    const agents = await prisma.agentConfig.findMany({ select: { id: true, model: true } });
    const modelOf = new Map(agents.map((a) => [a.id, a.model]));
    runs = rows.length;
    for (const r of rows) {
      const cost = costUsd(modelOf.get(r.agentId) ?? "claude-opus-4-8", r.inputTokens, r.outputTokens);
      total += cost;
      const cur = byAgent.get(r.agentName) ?? { runs: 0, cost: 0 };
      cur.runs += 1;
      cur.cost += cost;
      byAgent.set(r.agentName, cur);
    }
  } catch {
    return NextResponse.json({ sent: false, reason: "agent tables missing" });
  }

  const lines = [`*Agent cost report — ${label}*`, `${runs} runs · $${total.toFixed(2)} total`];
  for (const [name, v] of [...byAgent.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 10))
    lines.push(`• ${name}: ${v.runs} runs, $${v.cost.toFixed(2)}`);
  const sent = await postSlack(lines.join("\n"));
  return NextResponse.json({ sent, month: label, total });
}
