import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Real platform analytics for the operator/admin dashboard — computed live from
// the database, no fabricated numbers. Admin-only.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const since30 = new Date(Date.now() - 30 * 86_400_000);

  const [totalUsers, sessions, newUsers30, activeCoaches, recentSessionUsers, plansByGoal, usersByLang] =
    await Promise.all([
      prisma.user.count(),
      prisma.session.count(),
      prisma.user.count({ where: { createdAt: { gte: since30 } } }),
      prisma.coachLink.findMany({ where: { status: "ACTIVE" }, select: { coachId: true }, distinct: ["coachId"] }),
      prisma.session.findMany({ where: { startedAt: { gte: since30 } }, select: { userId: true }, distinct: ["userId"] }),
      prisma.macrocycle.groupBy({ by: ["goal"], _count: { goal: true }, orderBy: { _count: { goal: "desc" } }, take: 6 }),
      prisma.user.groupBy({ by: ["language"], _count: { language: true } }),
    ]);

  return NextResponse.json({
    totalUsers,
    sessions,
    newUsers30,
    coaches: activeCoaches.length,
    mau: recentSessionUsers.length,
    planPopularity: plansByGoal.map((p) => ({ goal: p.goal, n: p._count.goal })),
    langSplit: usersByLang
      .map((l) => ({ lang: l.language, n: l._count.language }))
      .sort((a, b) => b.n - a.n),
  });
}
