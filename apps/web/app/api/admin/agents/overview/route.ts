import { NextResponse } from "next/server";
import { costUsd, type Kpi } from "@hybrid/core";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { rowToDefinition } from "../shared";

// One aggregate call powering Agent HQ: org roster, headline stats (incl. dollar
// cost), the 7-day run trend, recent activity, upcoming scheduled work, per-agent
// SCORECARDS (KPIs + measured performance), and the attention INBOX (failed runs
// + schedules that can't fire). Admin-only; each table read independently so a
// missing one degrades to empty rather than 500ing the dashboard.
type RunLite = {
  id: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  status: string;
  runtime: string;
  task: string;
  delegations: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  createdAt: string;
};

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const agentRows = await prisma.agentConfig.findMany({ orderBy: { createdAt: "asc" } });
  const defs = agentRows.map(rowToDefinition);
  const modelOf = new Map(defs.map((d) => [d.id, d.model]));
  const agents = defs.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    status: a.status,
    model: a.model,
    authority: a.authority,
    reportsTo: a.reportsTo,
    runtime: a.runtime,
    kpis: a.kpis.length,
  }));

  let runs: RunLite[] = [];
  try {
    const rows = await prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 400 });
    runs = rows.map((r) => {
      const model = modelOf.get(r.agentId) ?? "claude-opus-4-8";
      return {
        id: r.id,
        agentId: r.agentId,
        agentName: r.agentName,
        agentRole: r.agentRole,
        status: r.status,
        runtime: r.runtime,
        task: r.task,
        delegations: Array.isArray(r.steps) ? (r.steps as unknown[]).length : 0,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cost: costUsd(model, r.inputTokens, r.outputTokens),
        createdAt: r.createdAt.toISOString(),
      };
    });
  } catch {
    /* AgentRun not migrated yet */
  }

  let schedules: { id: string; agentId: string; task: string; cadence: string; enabled: boolean; nextRunAt: Date | null }[] = [];
  try {
    schedules = await prisma.agentSchedule.findMany();
  } catch {
    /* AgentSchedule not migrated yet */
  }

  // --- time windows ---
  const now = Date.now();
  const dayMs = 86_400_000;
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const weekStart = now - 7 * dayMs;
  const within = (iso: string, from: number) => new Date(iso).getTime() >= from;

  const runsToday = runs.filter((r) => within(r.createdAt, todayStart));
  const runsWeek = runs.filter((r) => within(r.createdAt, weekStart));
  const okWeek = runsWeek.filter((r) => r.status === "ok").length;
  const sum = (rs: RunLite[], f: (r: RunLite) => number) => rs.reduce((n, r) => n + f(r), 0);

  // --- 7-day trend ---
  const trend: { day: string; ok: number; error: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(new Date().setHours(0, 0, 0, 0)).getTime() - i * dayMs;
    const end = start + dayMs;
    const inDay = runs.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= start && t < end;
    });
    trend.push({
      day: new Date(start).toLocaleDateString(undefined, { weekday: "short" }),
      ok: inDay.filter((r) => r.status === "ok").length,
      error: inDay.filter((r) => r.status === "error").length,
    });
  }

  // --- per-agent scorecards (KPI targets + measured performance) ---
  const scorecards = defs.map((d) => {
    const mine = runs.filter((r) => r.agentId === d.id);
    const wk = mine.filter((r) => within(r.createdAt, weekStart));
    const ok = wk.filter((r) => r.status === "ok").length;
    return {
      id: d.id,
      name: d.name,
      role: d.role,
      status: d.status,
      model: d.model,
      authority: d.authority,
      runtime: d.runtime,
      kpis: d.kpis as Kpi[],
      runs7d: wk.length,
      successRate: wk.length ? Math.round((ok / wk.length) * 100) : null,
      tokens7d: sum(wk, (r) => r.inputTokens + r.outputTokens),
      cost7d: sum(wk, (r) => r.cost),
      lastRunAt: mine[0]?.createdAt ?? null, // runs are newest-first
    };
  });

  // --- upcoming scheduled work ---
  const byId = new Map(agents.map((a) => [a.id, a]));
  const upcoming = schedules
    .filter((s) => s.enabled && s.nextRunAt)
    .sort((a, b) => a.nextRunAt!.getTime() - b.nextRunAt!.getTime())
    .slice(0, 8)
    .map((s) => {
      const a = byId.get(s.agentId);
      return {
        id: s.id,
        agentId: s.agentId,
        agentName: a?.name ?? "(deleted agent)",
        role: a?.role ?? "—",
        status: a?.status ?? "—",
        task: s.task,
        cadence: s.cadence,
        nextRunAt: s.nextRunAt ? s.nextRunAt.toISOString() : null,
      };
    });

  // --- attention inbox: failures + schedules that can't fire ---
  const failed = runs.filter((r) => r.status === "error").slice(0, 12);
  const brokenSchedules = schedules
    .filter((s) => s.enabled)
    .map((s) => ({ s, a: byId.get(s.agentId) }))
    .filter(({ a }) => !a || a.status !== "active")
    .slice(0, 12)
    .map(({ s, a }) => ({
      id: s.id,
      agentId: s.agentId,
      agentName: a?.name ?? "(deleted agent)",
      cadence: s.cadence,
      task: s.task,
      reason: !a ? "agent deleted" : `agent ${a.status}`,
    }));
  const failed24h = failed.filter((r) => within(r.createdAt, now - dayMs)).length;

  const stats = {
    agents: {
      total: agents.length,
      active: agents.filter((a) => a.status === "active").length,
      paused: agents.filter((a) => a.status === "paused").length,
      draft: agents.filter((a) => a.status === "draft").length,
    },
    runs: {
      today: runsToday.length,
      week: runsWeek.length,
      successRate: runsWeek.length ? Math.round((okWeek / runsWeek.length) * 100) : null,
    },
    tokens: { today: sum(runsToday, (r) => r.inputTokens + r.outputTokens), week: sum(runsWeek, (r) => r.inputTokens + r.outputTokens) },
    cost: { today: sum(runsToday, (r) => r.cost), week: sum(runsWeek, (r) => r.cost) },
    schedules: { total: schedules.length, enabled: schedules.filter((s) => s.enabled).length },
    attention: failed24h + brokenSchedules.length,
  };

  return NextResponse.json({
    agents,
    stats,
    trend,
    recent: runs.slice(0, 12),
    upcoming,
    scorecards,
    attention: { failed, brokenSchedules },
  });
}
