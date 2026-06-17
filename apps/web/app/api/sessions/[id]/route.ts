import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Manage one of the athlete's own logged workouts. Both clients call this.
// Every query is scoped to the authenticated user's id — a user can only
// archive/restore/delete their OWN Session rows.

// PATCH { archived: boolean } — soft-archive (hide from History, recoverable)
// or restore a workout. Archived rows stay in the DB but drop out of the
// default History list and the engines.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { archived?: unknown };
  if (typeof body.archived !== "boolean")
    return NextResponse.json({ error: "archived (boolean) is required" }, { status: 400 });

  const existing = await prisma.session.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const session = await prisma.session.update({
    where: { id },
    data: { archivedAt: body.archived ? new Date() : null },
  });
  return NextResponse.json({ session });
}

// DELETE — permanently remove one of your own workouts.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.session.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.session.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
