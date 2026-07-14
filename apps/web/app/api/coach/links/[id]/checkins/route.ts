import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// A client's daily check-ins, read by their coach (or the client) via the link.
// The coach only ever sees check-ins the client chose to SHARE; the client (when
// reading their own via the link) sees all of theirs.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (link.coachId !== me.id && link.clientId !== me.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Coach reads require an ACCEPTED (ACTIVE) link — a PENDING coach-initiated
  // link must not expose the athlete's shared check-ins before consent.
  if (link.clientId !== me.id && link.status !== "ACTIVE")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const isCoach = link.coachId === me.id;
  const checkins = await prisma.checkin.findMany({
    where: { userId: link.clientId, ...(isCoach ? { sharedWithCoach: true } : {}) },
    orderBy: { weekOf: "desc" },
    take: 60,
  });
  return NextResponse.json({ checkins });
}
