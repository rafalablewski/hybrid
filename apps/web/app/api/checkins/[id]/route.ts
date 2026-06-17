import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Coach replies to a check-in. Allowed only for the athlete's ACTIVE coach.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const checkin = await prisma.checkin.findUnique({ where: { id } });
  if (!checkin) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The coach can only reply to a check-in the athlete chose to share.
  if (!checkin.sharedWithCoach) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const link = await prisma.coachLink.findFirst({
    where: { coachId: me.id, clientId: checkin.userId, status: "ACTIVE" },
  });
  if (!link) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as { coachReply?: unknown };
  if (typeof b.coachReply !== "string" || !b.coachReply.trim())
    return NextResponse.json({ error: "reply is required" }, { status: 400 });

  const updated = await prisma.checkin.update({
    where: { id },
    data: { coachReply: b.coachReply.trim().slice(0, 2000), repliedAt: new Date() },
  });
  return NextResponse.json({ checkin: updated });
}
