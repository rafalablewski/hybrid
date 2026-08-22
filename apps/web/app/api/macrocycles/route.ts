import { NextResponse } from "next/server";
import { buildMacrocycle, goalIdToStore } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// A user's periodized seasons. Enrolling in a plan builds a macrocycle from the
// shared engine and persists it. Scoped to the authenticated user.

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const macrocycles = await prisma.macrocycle.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    take: 10,
  });
  return NextResponse.json({ macrocycles });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 32 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data as { goal?: unknown; eventInWeeks?: unknown; planId?: unknown };
  if (typeof b.goal !== "string" || !b.goal.trim()) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  const eventInWeeks = typeof b.eventInWeeks === "number" ? b.eventInWeeks : null;
  // STORE THE GOAL AS AN ID. Normalising here rather than trusting the client
  // is what lets an older build, which still sends the display name, land a
  // joinable row without shipping a new binary. A goal the library does not
  // know (a coach's free text) passes through unchanged — see core goal-id.ts.
  const goal = goalIdToStore(b.goal);
  const macro = buildMacrocycle(goal, eventInWeeks);
  // The enrolled named plan (when the athlete picked a real plan) — drives
  // "Your plan today". Best-effort: tolerate the column not being migrated yet.
  const planId = typeof b.planId === "string" && b.planId.trim() ? b.planId.trim().slice(0, 64) : null;

  let macrocycle;
  try {
    macrocycle = await prisma.macrocycle.create({
      data: {
        userId: user.id,
        goal,
        planId,
        eventDate: null,
        blocks: macro.blocks as object,
      },
    });
  } catch {
    // planId column not migrated yet (run reference/sql-macrocycle-planid.sql) —
    // still enroll, just without the named-plan link.
    macrocycle = await prisma.macrocycle.create({
      data: { userId: user.id, goal, eventDate: null, blocks: macro.blocks as object },
    });
  }

  return NextResponse.json({ macrocycle }, { status: 201 });
}
