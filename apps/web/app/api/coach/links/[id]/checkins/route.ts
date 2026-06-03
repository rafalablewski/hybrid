import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// A client's weekly check-ins, read by their coach (or the client) via the link.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (link.coachId !== me.id && link.clientId !== me.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const checkins = await prisma.checkin.findMany({
    where: { userId: link.clientId },
    orderBy: { weekOf: "desc" },
    take: 26,
  });
  return NextResponse.json({ checkins });
}
