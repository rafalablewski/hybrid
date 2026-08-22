import { NextResponse } from "next/server";
import { buildMacrocycle, goalIdToStore } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Assign one plan to a WHOLE group at once: for every member who is still an
// ACTIVE client of this coach, persist a Macrocycle (optionally a specific named
// plan from the library). This is the bulk version of
// /api/coach/links/[id]/macrocycle — same per-client effect, fanned out.

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: b, error } = await readJsonLimited<{ goal?: unknown; planId?: unknown }>(request, 4 * 1024);
  if (error) return error;
  if (typeof b.goal !== "string" || !b.goal.trim())
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  // A goal id when the library knows it, the coach's own words when it does not.
  const goal = goalIdToStore(b.goal);
  const planId = typeof b.planId === "string" && b.planId.trim() ? b.planId.trim() : null;

  try {
    const group = await prisma.coachGroup.findUnique({ where: { id } });
    if (!group || group.coachId !== me.id) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Re-validate membership against ACTIVE links — never assign to a non-client.
    const active = await prisma.coachLink.findMany({
      where: { coachId: me.id, status: "ACTIVE", clientId: { in: group.clientIds } },
      select: { clientId: true },
    });
    if (active.length === 0)
      return NextResponse.json({ error: "no active clients in this group" }, { status: 400 });

    const macro = buildMacrocycle(goal);
    const blocks = macro.blocks as object;
    await prisma.macrocycle.createMany({
      data: active.map((l) => ({ userId: l.clientId, goal, planId, eventDate: null, blocks })),
    });
    return NextResponse.json({ assigned: active.length }, { status: 201 });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ error: "Groups aren't enabled yet — run reference/sql-coach-groups.sql." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
