import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Accept a pending invite (client only) or end a link (either party).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });

  const action = (await request.json().catch(() => ({})) as { action?: unknown }).action;

  if (action === "accept") {
    if (link.clientId !== me.id || link.status !== "PENDING") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const updated = await prisma.coachLink.update({ where: { id }, data: { status: "ACTIVE" } });
    return NextResponse.json({ link: updated });
  }

  if (action === "end") {
    if (link.coachId !== me.id && link.clientId !== me.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const updated = await prisma.coachLink.update({ where: { id }, data: { status: "ENDED" } });
    return NextResponse.json({ link: updated });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
