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
// (e.g. scheduleWeek() laying the reconciled plan across the week). Each row is
// authored by the athlete for the athlete — same trust model as logging a
// session. Coach-authored assignments still go through the coach link route.
export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { items?: unknown };
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

  await prisma.assignment.createMany({ data: rows });
  return NextResponse.json({ created: rows.length }, { status: 201 });
}
