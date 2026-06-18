import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { sanitizeProgramWeeks, programAssignments } from "@/lib/coach-program";

// Assign an authored program to a client (linkId) or a whole group (groupId),
// materializing every week's days into dated Assignments from a start date.
// Membership/links are re-validated as ACTIVE — never assign to a non-client.

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as { linkId?: unknown; groupId?: unknown; startDate?: unknown };
  const start = typeof b.startDate === "string" && !Number.isNaN(Date.parse(b.startDate)) ? new Date(b.startDate) : new Date();

  try {
    const program = await prisma.coachProgram.findUnique({ where: { id } });
    if (!program || program.coachId !== me.id) return NextResponse.json({ error: "not found" }, { status: 404 });
    const weeks = sanitizeProgramWeeks(program.weeks);
    const sessions = weeks.reduce((n, w) => n + w.days.length, 0);
    if (sessions === 0) return NextResponse.json({ error: "this program has no sessions yet" }, { status: 400 });

    // Resolve target client ids — re-validated against ACTIVE links owned by me.
    let clientIds: string[] = [];
    if (typeof b.groupId === "string") {
      const group = await prisma.coachGroup.findUnique({ where: { id: b.groupId } });
      if (!group || group.coachId !== me.id) return NextResponse.json({ error: "group not found" }, { status: 404 });
      const active = await prisma.coachLink.findMany({
        where: { coachId: me.id, status: "ACTIVE", clientId: { in: group.clientIds } },
        select: { clientId: true },
      });
      clientIds = active.map((l) => l.clientId);
    } else if (typeof b.linkId === "string") {
      const link = await prisma.coachLink.findUnique({ where: { id: b.linkId } });
      if (!link || link.coachId !== me.id || link.status !== "ACTIVE")
        return NextResponse.json({ error: "client not found" }, { status: 404 });
      clientIds = [link.clientId];
    } else {
      return NextResponse.json({ error: "linkId or groupId is required" }, { status: 400 });
    }
    if (clientIds.length === 0) return NextResponse.json({ error: "no active clients to assign" }, { status: 400 });

    const rows = clientIds.flatMap((cid) => programAssignments(weeks, cid, me.id, start));
    await prisma.assignment.createMany({ data: rows });
    return NextResponse.json({ assigned: clientIds.length, sessions }, { status: 201 });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ error: "Programs aren't enabled yet — run reference/sql-coach-programs.sql." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
