import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// A coach reads a client's sessions ONLY through an ACTIVE link. This is the
// relationship-based authorization the whole permission model rests on.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (link.coachId !== me.id || link.status !== "ACTIVE") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sessions = await prisma.session.findMany({
    // Archived sessions are hidden from the coach too (the athlete hid them).
    where: { userId: link.clientId, archivedAt: null },
    orderBy: { startedAt: "desc" },
    take: 50,
    // Explicit field list — the athlete's private note/mood/tags are OWNER-ONLY
    // and must never reach a coach. Never widen this to a raw-row return.
    select: { id: true, userId: true, title: true, startedAt: true, completedAt: true, blocks: true, readiness: true, archivedAt: true },
  });
  return NextResponse.json({ sessions });
}
