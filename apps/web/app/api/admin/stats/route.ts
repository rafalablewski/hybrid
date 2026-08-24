import { NextResponse } from "next/server";
import { costUsd, goalLabel } from "@hybrid/core";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// How many whole 7-day windows ago a timestamp falls (0 = current week). Used to
// bucket growth in SQL instead of fetching every row and filtering 12× in JS.
type WeekBucket = { wk_ago: number; n: number };

// Real platform analytics for the operator/admin dashboard — computed live from
// the database, no fabricated numbers. Admin-only. Aggregates only: no single
// user's private training rows are returned here.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const now = Date.now();
  const since30 = new Date(now - 30 * 86_400_000);
  const since12w = new Date(now - 84 * 86_400_000);

  const [
    totalUsers,
    sessions,
    newUsers30,
    activeCoaches,
    recentSessionUsers,
    plansByGoal,
    usersByLang,
    roleSplit,
    activeLinks,
    userWeeks,
    sessionWeeks,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.session.count(),
    prisma.user.count({ where: { createdAt: { gte: since30 } } }),
    // COUNT(DISTINCT ...) in SQL instead of fetching every distinct row to .length in JS.
    prisma.$queryRaw<{ n: number }[]>`SELECT count(DISTINCT "coachId")::int AS n FROM "CoachLink" WHERE "status" = 'ACTIVE'`,
    prisma.$queryRaw<{ n: number }[]>`SELECT count(DISTINCT "userId")::int AS n FROM "Session" WHERE "startedAt" >= ${since30}`,
    // NO `take` HERE, deliberately. The column holds goal IDS now and rows
    // written earlier hold display NAMES (see core goal-id.ts), so the same goal
    // can be two groups — "hybrid" and "Hybrid Athlete" — and truncating before
    // they are merged would drop a real bar and rank the rest wrongly. Grouped
    // whole, merged by label below, then cut to six.
    prisma.macrocycle.groupBy({ by: ["goal"], _count: { goal: true }, orderBy: { _count: { goal: "desc" } } }),
    prisma.user.groupBy({ by: ["language"], _count: { language: true } }),
    prisma.user.groupBy({ by: ["role"], _count: { role: true } }),
    prisma.coachLink.count({ where: { status: "ACTIVE" } }),
    // Growth buckets computed in SQL (≤12 rows back) rather than fetching every
    // row in the window and filtering it 12 times in the lambda.
    prisma.$queryRaw<WeekBucket[]>`SELECT floor(extract(epoch from (now() - "createdAt")) / 604800)::int AS wk_ago, count(*)::int AS n FROM "User" WHERE "createdAt" >= ${since12w} GROUP BY 1`,
    prisma.$queryRaw<WeekBucket[]>`SELECT floor(extract(epoch from (now() - "startedAt")) / 604800)::int AS wk_ago, count(*)::int AS n FROM "Session" WHERE "startedAt" >= ${since12w} GROUP BY 1`,
  ]);

  const signupsByWeek = new Map(userWeeks.map((w) => [w.wk_ago, w.n]));
  const sessionsByWeek = new Map(sessionWeeks.map((w) => [w.wk_ago, w.n]));
  const weeks: { week: string; signups: number; sessions: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const end = now - i * 7 * 86_400_000;
    weeks.push({
      week: new Date(end).toISOString().slice(5, 10), // MM-DD
      signups: signupsByWeek.get(i) ?? 0,
      sessions: sessionsByWeek.get(i) ?? 0,
    });
  }

  // Actual AI agent run spend over the last 30 days. Aggregate tokens per agent
  // in SQL (one row per agent), then apply that agent's model price — instead of
  // loading every run row and reducing in memory.
  let agentSpend30d = 0;
  let agentRuns30d = 0;
  try {
    const [grouped, agentRows] = await Promise.all([
      prisma.agentRun.groupBy({
        by: ["agentId"],
        where: { createdAt: { gte: since30 } },
        _sum: { inputTokens: true, outputTokens: true },
        _count: { _all: true },
      }),
      prisma.agentConfig.findMany({ select: { id: true, model: true } }),
    ]);
    const modelOf = new Map(agentRows.map((a) => [a.id, a.model]));
    agentRuns30d = grouped.reduce((n, g) => n + g._count._all, 0);
    agentSpend30d = grouped.reduce(
      (n, g) => n + costUsd(modelOf.get(g.agentId) ?? "claude-opus-4-8", g._sum.inputTokens ?? 0, g._sum.outputTokens ?? 0),
      0,
    );
  } catch {
    /* agent tables not migrated yet */
  }

  return NextResponse.json({
    totalUsers,
    sessions,
    newUsers30,
    agentSpend30d,
    agentRuns30d,
    coaches: activeCoaches[0]?.n ?? 0,
    mau: recentSessionUsers[0]?.n ?? 0,
    activeLinks,
    planPopularity: mergeByGoalLabel(plansByGoal),
    langSplit: usersByLang
      .map((l) => ({ lang: l.language, n: l._count.language }))
      .sort((a, b) => b.n - a.n),
    roleSplit: roleSplit.map((r) => ({ role: r.role, n: r._count.role })),
    growth: weeks,
  });
}

/** Goal counts by DISPLAY NAME, merging the id and legacy-name rows for the same
 *  goal into one bar. Six most popular, descending. */
function mergeByGoalLabel(rows: { goal: string; _count: { goal: number } }[]): { goal: string; n: number }[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const label = goalLabel(r.goal) || r.goal;
    totals.set(label, (totals.get(label) ?? 0) + r._count.goal);
  }
  return [...totals.entries()]
    .map(([goal, n]) => ({ goal, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);
}
