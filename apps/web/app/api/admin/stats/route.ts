import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

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
    orgs,
    activeLinks,
    recentUsers,
    recentSessions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.session.count(),
    prisma.user.count({ where: { createdAt: { gte: since30 } } }),
    prisma.coachLink.findMany({ where: { status: "ACTIVE" }, select: { coachId: true }, distinct: ["coachId"] }),
    prisma.session.findMany({ where: { startedAt: { gte: since30 } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.macrocycle.groupBy({ by: ["goal"], _count: { goal: true }, orderBy: { _count: { goal: "desc" } }, take: 6 }),
    prisma.user.groupBy({ by: ["language"], _count: { language: true } }),
    prisma.user.groupBy({ by: ["role"], _count: { role: true } }),
    prisma.organization.count(),
    prisma.coachLink.count({ where: { status: "ACTIVE" } }),
    prisma.user.findMany({ where: { createdAt: { gte: since12w } }, select: { createdAt: true } }),
    prisma.session.findMany({ where: { startedAt: { gte: since12w } }, select: { startedAt: true } }),
  ]);

  // Bucket the last 12 ISO-ish weeks for the growth chart.
  const weeks: { week: string; signups: number; sessions: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = now - (i + 1) * 7 * 86_400_000;
    const end = now - i * 7 * 86_400_000;
    const label = new Date(end).toISOString().slice(5, 10); // MM-DD
    weeks.push({
      week: label,
      signups: recentUsers.filter((u) => +u.createdAt > start && +u.createdAt <= end).length,
      sessions: recentSessions.filter((s) => +s.startedAt > start && +s.startedAt <= end).length,
    });
  }

  return NextResponse.json({
    totalUsers,
    sessions,
    newUsers30,
    coaches: activeCoaches.length,
    mau: recentSessionUsers.length,
    orgs,
    activeLinks,
    planPopularity: plansByGoal.map((p) => ({ goal: p.goal, n: p._count.goal })),
    langSplit: usersByLang
      .map((l) => ({ lang: l.language, n: l._count.language }))
      .sort((a, b) => b.n - a.n),
    roleSplit: roleSplit.map((r) => ({ role: r.role, n: r._count.role })),
    growth: weeks,
  });
}
