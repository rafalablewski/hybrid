import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { rowToDefinition } from "../shared";

// One aggregate call powering the Agent HQ command center: org roster, headline
// stats, the 7-day run trend, the recent-activity feed, and upcoming scheduled
// work. Admin-only. Each table is read independently so a missing one (not yet
// migrated) degrades to empty rather than 500ing the whole dashboard.
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
  createdAt: string;
};

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const agentRows = await prisma.agentConfig.findMany({ orderBy: { createdAt: "asc" } });
  const agents = agentRows.map(rowToDefinition).map((a) => ({
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
    const rows = await prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
    runs = rows.map((r) => ({
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
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    /* AgentRun not migrated yet */
  }

  let upcoming: { id: string; agentId: string; agentName: string; role: string; status: string; task: string; cadence: string; nextRunAt: string | null }[] = [];
  let scheduleStats = { total: 0, enabled: 0 };
  try {
    const all = await prisma.agentSchedule.findMany();
    scheduleStats = { total: all.length, enabled: all.filter((s) => s.enabled).length };
    const byId = new Map(agents.map((a) => [a.id, a]));
    upcoming = all
      .filter((s) => s.enabled && s.nextRunAt)
      .sort((a, b) => (a.nextRunAt!.getTime() - b.nextRunAt!.getTime()))
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
  } catch {
    /* AgentSchedule not migrated yet */
  }

  // --- derived stats ---
  const now = Date.now();
  const dayMs = 86_400_000;
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const weekStart = now - 7 * dayMs;

  const within = (iso: string, from: number) => new Date(iso).getTime() >= from;
  const runsToday = runs.filter((r) => within(r.createdAt, todayStart));
  const runsWeek = runs.filter((r) => within(r.createdAt, weekStart));
  const okWeek = runsWeek.filter((r) => r.status === "ok").length;
  const tokens = (rs: RunLite[]) => rs.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0);

  // 7-day trend (oldest → newest)
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
    tokens: { today: tokens(runsToday), week: tokens(runsWeek) },
    schedules: scheduleStats,
  };

  return NextResponse.json({ agents, stats, trend, recent: runs.slice(0, 12), upcoming });
}
