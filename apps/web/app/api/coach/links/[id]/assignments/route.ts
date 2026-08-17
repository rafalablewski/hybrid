import { NextResponse } from "next/server";
import { coachAssignmentPush, type SessionBlock } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { assignmentDayLabel, notify } from "@/lib/push";

// Assignments for a coach↔client link. GET: the client's assignments (coach or
// client). POST: the coach schedules a workout to the client on a date.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (link.coachId !== me.id && link.clientId !== me.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // A coach may only read the athlete's data once the athlete has ACCEPTED
  // (link ACTIVE). Inviting an existing user auto-creates a PENDING link, which
  // must NOT expose their assignments before consent. The client (reading their
  // own via the link) is unaffected.
  if (link.clientId !== me.id && link.status !== "ACTIVE")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const assignments = await prisma.assignment.findMany({
    where: { athleteId: link.clientId },
    orderBy: { date: "desc" },
    take: 60,
  });
  return NextResponse.json({ assignments });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (link.coachId !== me.id || link.status !== "ACTIVE")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as {
    templateId?: unknown; name?: unknown; blocks?: unknown; date?: unknown;
  };
  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!Array.isArray(b.blocks))
    return NextResponse.json({ error: "blocks must be an array" }, { status: 400 });
  const date = typeof b.date === "string" && !Number.isNaN(Date.parse(b.date)) ? new Date(b.date) : new Date();

  const assignment = await prisma.assignment.create({
    data: {
      athleteId: link.clientId,
      assignedById: me.id,
      templateId: typeof b.templateId === "string" ? b.templateId : null,
      name: b.name.trim().slice(0, 120),
      blocks: b.blocks as unknown as SessionBlock[] as object,
      date,
    },
  });

  // Somebody ELSE just acted on this athlete's account, which is the whole
  // argument for a push: there is no way to discover it by not opening the app.
  // Awaited (a serverless function stops the moment it responds) but incapable
  // of failing the assignment — see lib/push.ts notify().
  await notify(link.clientId, "coach", (lang) =>
    coachAssignmentPush({
      coach: me.name ?? "",
      session: assignment.name,
      when: assignmentDayLabel(assignment.date, lang),
      lang,
    }),
  );

  return NextResponse.json({ assignment }, { status: 201 });
}
