import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { sanitizeProgramWeeks } from "@/lib/coach-program";

// Coach-authored multi-week programs (type 3 of the plan model). Owned by the
// coach; assigned to a client/group via [id]/assign, which materializes the
// weeks into dated Assignments. Soft-degrades to "not enabled yet" until
// reference/sql-coach-programs.sql has been run.

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const programs = await prisma.coachProgram.findMany({ where: { coachId: me.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ programs });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ programs: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "COACH" && me.role !== "ADMIN")
    return NextResponse.json({ error: "coach only" }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as { name?: unknown; goal?: unknown; weeks?: unknown };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const goal = typeof b.goal === "string" && b.goal.trim() ? b.goal.trim().slice(0, 40) : null;
  const weeks = sanitizeProgramWeeks(b.weeks);

  try {
    const program = await prisma.coachProgram.create({ data: { coachId: me.id, name, goal, weeks } });
    return NextResponse.json({ program }, { status: 201 });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ error: "Programs aren't enabled yet — run reference/sql-coach-programs.sql." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
