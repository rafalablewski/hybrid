import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// A solo coach's lightweight client GROUPS — a named set of their clients so a
// whole plan can be assigned to everyone at once (see [id]/assign-plan). Owned
// by the coach; membership is re-validated against ACTIVE CoachLinks at assign
// time. Soft-degrades to "not enabled yet" until reference/sql-coach-groups.sql
// has been run (the CoachGroup table doesn't exist), so the deploy is safe in
// any order.

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010"; // table does not exist
};

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const groups = await prisma.coachGroup.findMany({
      where: { coachId: me.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ groups });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ groups: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "COACH" && me.role !== "ADMIN")
    return NextResponse.json({ error: "coach only" }, { status: 403 });

  const { data: b, error } = await readJsonLimited<{ name?: unknown }>(request, 4 * 1024);
  if (error) return error;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "name too long" }, { status: 400 });

  try {
    const group = await prisma.coachGroup.create({ data: { coachId: me.id, name, clientIds: [] } });
    return NextResponse.json({ group }, { status: 201 });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ error: "Groups aren't enabled yet — run reference/sql-coach-groups.sql." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
