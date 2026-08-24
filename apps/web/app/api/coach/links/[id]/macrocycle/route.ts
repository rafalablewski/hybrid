import { NextResponse } from "next/server";
import { buildMacrocycle, goalIdToStore } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// A coach persists a periodized season FOR a rostered client (CoachLink-gated),
// so the client's Periodize/Today reflect the SAME macrocycle the coach then
// generates a week from — one shared source instead of an on-the-fly build.
// Defense-in-depth: run reference/sql-coach-macrocycle.sql in Supabase to add the
// matching active-coach RLS policy (the API already gates by the link).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (link.coachId !== me.id || link.status !== "ACTIVE")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: b, error } = await readJsonLimited<{ goal?: unknown; planId?: unknown }>(request, 4 * 1024);
  if (error) return error;
  if (typeof b.goal !== "string" || !b.goal.trim())
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  // Optional: a specific named plan from the library (drives the client's
  // "Your plan today" exactly as written; null = engine-prescribed by goal).
  const planId = typeof b.planId === "string" && b.planId.trim() ? b.planId.trim() : null;

  // Normalised to a goal id when the library knows it. A coach typing their own
  // goal ("Return from ACL, phase 2") is stored verbatim and displays as written.
  const goal = goalIdToStore(b.goal);
  const macro = buildMacrocycle(goal);
  const macrocycle = await prisma.macrocycle.create({
    data: { userId: link.clientId, goal, planId, eventDate: null, blocks: macro.blocks as object },
  });
  return NextResponse.json({ macrocycle }, { status: 201 });
}
