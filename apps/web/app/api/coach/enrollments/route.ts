import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing, authorCards, deliverProgramAssignments } from "@/lib/social";

// Program enrolments. GET returns both sides: requests INTO my programs (as a
// coach) and programs I've started (as a client). POST lets the COACH
// accept/decline a request → flips the CoachLink + enrolment to active.

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [incoming, mine] = await Promise.all([
      prisma.programEnrollment.findMany({ where: { coachId: me.id }, orderBy: { createdAt: "desc" }, include: { program: { select: { name: true } } } }),
      prisma.programEnrollment.findMany({ where: { clientId: me.id }, orderBy: { createdAt: "desc" }, include: { program: { select: { name: true } } } }),
    ]);
    const clientCards = await authorCards(incoming.map((e) => e.clientId));
    const coachCards = await authorCards(mine.map((e) => e.coachId));
    return NextResponse.json({
      incoming: incoming.map((e) => ({
        id: e.id, programId: e.programId, programName: e.program.name, status: e.status,
        at: e.createdAt.getTime(), client: clientCards.get(e.clientId),
      })),
      mine: mine.map((e) => ({
        id: e.id, programId: e.programId, programName: e.program.name, status: e.status,
        at: e.createdAt.getTime(), coach: coachCards.get(e.coachId),
      })),
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ incoming: [], mine: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: b, error } = await readJsonLimited<{ enrollmentId?: unknown; action?: unknown }>(request);
  if (error) return error;
  const enrollmentId = typeof b.enrollmentId === "string" ? b.enrollmentId : "";
  const action = b.action === "accept" || b.action === "decline" || b.action === "end" ? b.action : "";
  if (!enrollmentId || !action) return NextResponse.json({ error: "enrollmentId + action required" }, { status: 400 });

  try {
    const enrollment = await prisma.programEnrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment || enrollment.coachId !== me.id)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    if (action === "accept") {
      const start = new Date();
      const result = await prisma.$transaction(async (tx) => {
        await tx.coachLink.upsert({
          where: { coachId_clientId: { coachId: me.id, clientId: enrollment.clientId } },
          update: { status: "ACTIVE" },
          create: { coachId: me.id, clientId: enrollment.clientId, status: "ACTIVE" },
        });
        const updated = await tx.programEnrollment.update({ where: { id: enrollmentId }, data: { status: "active", startedAt: start } });
        // Deliver the program: materialize its weeks into dated Assignments so
        // the client actually sees the workouts on their Today/Calendar.
        const assignments = await deliverProgramAssignments(tx, enrollment.programId, enrollment.clientId, me.id, start);
        return { updated, assignments };
      });
      return NextResponse.json({ enrollment: result.updated, assignments: result.assignments });
    }
    const status = action === "end" ? "ended" : "declined";
    const updated = await prisma.programEnrollment.update({ where: { id: enrollmentId }, data: { status } });
    return NextResponse.json({ enrollment: updated });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
