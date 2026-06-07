import { NextResponse } from "next/server";
import type { SessionBlock } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The signed-in athlete's own assignments (what's scheduled for them).
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const assignments = await prisma.assignment.findMany({
    where: { athleteId: me.id },
    orderBy: { date: "desc" },
    take: 120,
  });
  return NextResponse.json({ assignments });
}

// Self-schedule: the athlete materializes their own plan onto dated sessions
// (e.g. buildTrainingWeek() laying the reconciled week out). Each row is authored
// by the athlete for the athlete — same trust model as logging a session.
// With `replace: true` the upcoming, still-pending self-authored assignments
// (today onward) are cleared first, so re-running after you've logged a day
// regenerates the rest of the week off your REAL results (and re-scheduling is
// idempotent — no duplicates). Completed/coach-authored days are never touched.
export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { items?: unknown; replace?: unknown };
  if (!Array.isArray(body.items) || body.items.length === 0)
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
  if (body.items.length > 14)
    return NextResponse.json({ error: "too many items (max 14)" }, { status: 400 });

  const rows: { athleteId: string; assignedById: string; name: string; blocks: object; date: Date }[] = [];
  for (const raw of body.items) {
    const it = raw as { name?: unknown; blocks?: unknown; date?: unknown };
    if (typeof it.name !== "string" || !it.name.trim())
      return NextResponse.json({ error: "each item needs a name" }, { status: 400 });
    if (!Array.isArray(it.blocks))
      return NextResponse.json({ error: "each item needs a blocks array" }, { status: 400 });
    const date = typeof it.date === "string" && !Number.isNaN(Date.parse(it.date)) ? new Date(it.date) : new Date();
    rows.push({
      athleteId: me.id,
      assignedById: me.id,
      name: it.name.trim().slice(0, 120),
      blocks: it.blocks as unknown as SessionBlock[] as object,
      date,
    });
  }

  if (body.replace === true) {
    // Key the delete off the EARLIEST regenerated date (the new week's start),
    // not a server-local midnight — both delete and insert then use the same
    // client-derived clock, so a prior run's "today" row is always replaced
    // regardless of the athlete's timezone (no duplicates, no missed rows).
    const from = new Date(Math.min(...rows.map((r) => r.date.getTime())));
    await prisma.$transaction([
      prisma.assignment.deleteMany({
        where: { athleteId: me.id, assignedById: me.id, status: "assigned", date: { gte: from } },
      }),
      prisma.assignment.createMany({ data: rows }),
    ]);
  } else {
    await prisma.assignment.createMany({ data: rows });
  }
  return NextResponse.json({ created: rows.length }, { status: 201 });
}
