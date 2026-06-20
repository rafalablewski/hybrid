import { NextResponse } from "next/server";
import { costUsd } from "@hybrid/core";
import { requireAdmin, requireAgentOperator, audit } from "@/lib/admin";
import { rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { postSlack } from "@/lib/slack";

// Monthly agent cost report — per-agent spend + run counts for a month. Admin GET
// (JSON: current + previous month, or ?month=YYYY-MM&format=csv to download).
// Operator POST sends the current month's report to Slack.

export type MonthReport = { month: string; total: number; runs: number; perAgent: { name: string; runs: number; cost: number }[] };

function monthRange(key?: string | null): { start: Date; end: Date; label: string } {
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  if (key) {
    const [yy, mm] = key.split("-").map(Number);
    if (yy && mm && mm >= 1 && mm <= 12) {
      y = yy;
      m = mm - 1;
    }
  }
  return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)), label: `${y}-${String(m + 1).padStart(2, "0")}` };
}

async function reportFor(start: Date, end: Date, label: string): Promise<MonthReport> {
  try {
    const rows = await prisma.agentRun.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { agentId: true, agentName: true, inputTokens: true, outputTokens: true } });
    const agents = await prisma.agentConfig.findMany({ select: { id: true, model: true } });
    const modelOf = new Map(agents.map((a) => [a.id, a.model]));
    const byAgent = new Map<string, { runs: number; cost: number }>();
    let total = 0;
    for (const r of rows) {
      const cost = costUsd(modelOf.get(r.agentId) ?? "claude-opus-4-8", r.inputTokens, r.outputTokens);
      total += cost;
      const cur = byAgent.get(r.agentName) ?? { runs: 0, cost: 0 };
      cur.runs += 1;
      cur.cost += cost;
      byAgent.set(r.agentName, cur);
    }
    return {
      month: label,
      total,
      runs: rows.length,
      perAgent: [...byAgent.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.cost - a.cost),
    };
  } catch {
    return { month: label, total: 0, runs: 0, perAgent: [] };
  }
}

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");

  if (url.searchParams.get("format") === "csv") {
    const { start, end, label } = monthRange(monthParam);
    const rep = await reportFor(start, end, label);
    const lines = ["agent,runs,costUsd", ...rep.perAgent.map((p) => [p.name, p.runs, p.cost.toFixed(4)].map(csvCell).join(","))];
    lines.push(["TOTAL", rep.runs, rep.total.toFixed(4)].map(csvCell).join(","));
    return new Response(lines.join("\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="agent-cost-${label}.csv"` },
    });
  }

  const cur = monthRange(null);
  const prevEnd = cur.start;
  const prevStart = new Date(Date.UTC(prevEnd.getUTCFullYear(), prevEnd.getUTCMonth() - 1, 1));
  const prevLabel = `${prevStart.getUTCFullYear()}-${String(prevStart.getUTCMonth() + 1).padStart(2, "0")}`;
  const [current, previous] = await Promise.all([
    reportFor(cur.start, cur.end, cur.label),
    reportFor(prevStart, prevEnd, prevLabel),
  ]);
  return NextResponse.json({ current, previous });
}

export async function POST(request: Request) {
  const gate = await requireAgentOperator(request);
  if (gate.error) return gate.error;
  const limited = rateLimit(request, { key: "admin-costreport-send", limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { start, end, label } = monthRange(new URL(request.url).searchParams.get("month"));
  const rep = await reportFor(start, end, label);
  const lines = [`*Agent cost report — ${rep.month}*`, `${rep.runs} runs · $${rep.total.toFixed(2)} total`];
  for (const p of rep.perAgent.slice(0, 10)) lines.push(`• ${p.name}: ${p.runs} runs, $${p.cost.toFixed(2)}`);
  const sent = await postSlack(lines.join("\n"));

  await audit({
    actor: gate.admin,
    action: "agent.costreport.send",
    summary: `Sent the ${rep.month} cost report to Slack ($${rep.total.toFixed(2)}, ${rep.runs} runs)${sent ? "" : " — Slack not configured"}`,
    metadata: { month: rep.month, total: rep.total, runs: rep.runs, sent },
    req: request,
  });

  return NextResponse.json({ sent, month: rep.month, total: rep.total, reason: sent ? undefined : "SLACK_WEBHOOK_URL not set" });
}
