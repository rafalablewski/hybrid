import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Update an assignment's status (the athlete marks it complete/skipped, and may
// link the logged session). The athlete owns this; their active coach may also.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const a = await prisma.assignment.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isAthlete = a.athleteId === me.id;
  const isCoach =
    !isAthlete &&
    !!(await prisma.coachLink.findFirst({ where: { coachId: me.id, clientId: a.athleteId, status: "ACTIVE" } }));
  if (!isAthlete && !isCoach) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as { status?: unknown; sessionId?: unknown };
  const status = b.status === "completed" || b.status === "skipped" || b.status === "assigned" ? b.status : undefined;
  if (!status && typeof b.sessionId !== "string")
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const updated = await prisma.assignment.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(typeof b.sessionId === "string" ? { sessionId: b.sessionId } : {}),
    },
  });
  return NextResponse.json({ assignment: updated });
}
