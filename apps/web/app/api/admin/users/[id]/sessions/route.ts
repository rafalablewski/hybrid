import { NextResponse } from "next/server";
import { migrateBlocks } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { prisma } from "@/lib/db";

// A single user's logged workouts — the actual Session rows (title, timing,
// blocks, finished/unfinished, archived), not just the counts the directory
// shows. Admin-only support view so an operator can confirm what a registered
// user has (or hasn't) logged. Read-only + audited, matching the privacy posture
// of the rest of /api/admin/users/[id].
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { id } = await params;

  // Confirm the user exists (so a bad id 404s rather than returning an empty
  // list that looks like "no workouts").
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Include archived rows here (unlike the athlete's own History) — an admin is
  // auditing everything the account has logged, archived or not. Newest first.
  const rows = await prisma.session.findMany({
    where: { userId: id },
    orderBy: { startedAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      startedAt: true,
      completedAt: true,
      readiness: true,
      archivedAt: true,
      blocks: true,
    },
  });

  const sessions = rows.map((s) => ({
    id: s.id,
    title: s.title,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    readiness: s.readiness,
    archived: Boolean(s.archivedAt),
    // Finished = the athlete tapped done (completedAt set). An in-progress /
    // abandoned row saved without completion reads as unfinished.
    finished: Boolean(s.completedAt),
    blocks: migrateBlocks(s.blocks),
  }));

  await audit({
    actor: gate.admin,
    action: "user.sessions.view",
    targetType: "user",
    targetId: id,
    summary: `Viewed ${user.email}'s workouts`,
    req: request,
  });

  return NextResponse.json({ sessions });
}
