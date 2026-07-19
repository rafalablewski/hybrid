import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Leave (delete) one of the athlete's own enrolled seasons. Both clients call
// this from the Plans screen. Ownership-checked like /api/sessions/[id].
//
// Body (optional): { deleteHistory?: boolean }
// - false/absent → only the enrollment goes: the Macrocycle row + its
//   PlanDayOverride skips/postpones (meaningless without the plan). Logged
//   workouts stay in History and every engine.
// - true → additionally hard-deletes the Session rows logged during this
//   season's active window. Sessions carry no planId (the plan↔session link is
//   derived at read time by planSchedule), so "the plan's workouts" is the
//   date window [this season's startedAt, the next-started season's startedAt)
//   — a newer enrollment's sessions always survive deleting an older one.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { deleteHistory?: unknown };
  const deleteHistory = body.deleteHistory === true;

  // Tolerate the planId column not being migrated yet (reference/sql-macrocycle-planid.sql).
  let existing: { userId: string; planId: string | null; startedAt: Date } | null = null;
  try {
    existing = await prisma.macrocycle.findUnique({ where: { id }, select: { userId: true, planId: true, startedAt: true } });
  } catch {
    const row = await prisma.macrocycle.findUnique({ where: { id }, select: { userId: true, startedAt: true } });
    existing = row ? { ...row, planId: null } : null;
  }
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let deletedSessions = 0;
  if (deleteHistory) {
    const next = await prisma.macrocycle.findFirst({
      where: { userId: me.id, startedAt: { gt: existing.startedAt }, NOT: { id } },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true },
    });
    const wiped = await prisma.session.deleteMany({
      where: {
        userId: me.id,
        startedAt: { gte: existing.startedAt, ...(next ? { lt: next.startedAt } : {}) },
      },
    });
    deletedSessions = wiped.count;
  }

  // Best-effort: the PlanDayOverride table may not be migrated yet
  // (reference/sql-plan-day-overrides.sql) — leaving must still succeed.
  if (existing.planId) {
    try {
      await prisma.planDayOverride.deleteMany({ where: { userId: me.id, planId: existing.planId } });
    } catch {
      /* table not migrated — nothing to clear */
    }
  }

  await prisma.macrocycle.delete({ where: { id } });
  return NextResponse.json({ ok: true, deletedSessions });
}
