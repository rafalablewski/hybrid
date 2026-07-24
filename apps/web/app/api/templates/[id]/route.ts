import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Delete a template you own.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  // Select ONLY ownerId — never the `favourite` column, which may not be
  // migrated yet (see reference/sql-routine-favourite.sql); a full-row read would
  // break this owner check before the migration.
  const t = await prisma.workoutTemplate.findUnique({ where: { id }, select: { ownerId: true } });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (t.ownerId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.workoutTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Toggle the favourite star on a routine you own. Written via a guarded raw
// UPDATE so it soft-degrades (503) before reference/sql-routine-favourite.sql is
// run — exactly like the plan-maxes PUT. Owner-checked first.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const t = await prisma.workoutTemplate.findUnique({ where: { id }, select: { ownerId: true } });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (t.ownerId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as { favourite?: unknown };
  if (typeof b.favourite !== "boolean")
    return NextResponse.json({ error: "favourite (boolean) is required" }, { status: 400 });

  try {
    await prisma.$executeRaw`
      UPDATE "WorkoutTemplate" SET "favourite" = ${b.favourite} WHERE id = ${id}
    `;
  } catch {
    return NextResponse.json(
      { error: "Routine favourites aren't enabled yet — run reference/sql-routine-favourite.sql." },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, favourite: b.favourite });
}
