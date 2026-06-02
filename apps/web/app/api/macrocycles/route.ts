import { NextResponse } from "next/server";
import { buildMacrocycle } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const b = body as { goal?: unknown; eventInWeeks?: unknown };
  if (typeof b.goal !== "string" || !b.goal.trim()) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  const eventInWeeks = typeof b.eventInWeeks === "number" ? b.eventInWeeks : null;
  const macro = buildMacrocycle(b.goal.trim(), eventInWeeks);

  const macrocycle = await prisma.macrocycle.create({
    data: {
      userId: user.id,
      goal: b.goal.trim(),
      eventDate: null,
      blocks: macro.blocks as object,
    },
  });

  return NextResponse.json({ macrocycle }, { status: 201 });
}
