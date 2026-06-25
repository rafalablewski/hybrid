import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";

// Start an online program with a coach (client-initiated). Opens a CoachLink
// (PENDING, or ACTIVE when the coach set autoAccept) and a ProgramEnrollment.
// The coach accepts via /api/coach/enrollments. Free in this build — paid
// checkout is a separate, blocked layer (Stripe).

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, { key: "coach-enroll", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const { data: b, error } = await readJsonLimited<{ programId?: unknown }>(request);
  if (error) return error;
  const programId = typeof b.programId === "string" ? b.programId : "";
  if (!programId) return NextResponse.json({ error: "programId required" }, { status: 400 });

  try {
    const program = await prisma.coachProgram.findUnique({ where: { id: programId } });
    if (!program || !program.published) return NextResponse.json({ error: "program not available" }, { status: 404 });
    if (program.coachId === me.id) return NextResponse.json({ error: "That's your own program." }, { status: 400 });

    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: program.coachId }, select: { acceptingClients: true, autoAccept: true } });
    if (coachProfile && !coachProfile.acceptingClients)
      return NextResponse.json({ error: "This coach isn't accepting new clients right now." }, { status: 409 });

    const auto = !!coachProfile?.autoAccept;
    const linkStatus = auto ? "ACTIVE" : "PENDING";
    const enrollStatus = auto ? "active" : "requested";

    const result = await prisma.$transaction(async (tx) => {
      const link = await tx.coachLink.upsert({
        where: { coachId_clientId: { coachId: program.coachId, clientId: me.id } },
        update: {}, // never downgrade an existing ACTIVE link
        create: { coachId: program.coachId, clientId: me.id, status: linkStatus },
      });
      const enrollment = await tx.programEnrollment.upsert({
        where: { programId_clientId: { programId, clientId: me.id } },
        update: { status: enrollStatus, linkId: link.id, ...(auto ? { startedAt: new Date() } : {}) },
        create: {
          programId,
          coachId: program.coachId,
          clientId: me.id,
          status: enrollStatus,
          linkId: link.id,
          startedAt: auto ? new Date() : null,
        },
      });
      return { link, enrollment };
    });

    return NextResponse.json({ enrollment: result.enrollment, status: enrollStatus }, { status: 201 });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ error: "The marketplace isn't enabled yet — run reference/sql-social.sql." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
