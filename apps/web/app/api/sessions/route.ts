import { NextResponse } from "next/server";
import { migrateBlocks } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The logger's backend. Both clients (web + mobile) call this.
// Every query is scoped to the authenticated user's id — a user only ever
// reads/writes their own Session rows.

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // History hides archived workouts by default; `?archived=1` lists only the
  // archived ones (the "recently archived" view the athlete can restore from).
  const archivedOnly = new URL(request.url).searchParams.get("archived") === "1";
  const rows = await prisma.session.findMany({
    where: { userId: user.id, archivedAt: archivedOnly ? { not: null } : null },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  // Upgrade runs logged before the cardio/conditioning split so both clients
  // read them as cardio (migrateBlocks is idempotent).
  const sessions = rows.map((s) => ({ ...s, blocks: migrateBlocks(s.blocks) }));
  return NextResponse.json({ sessions });
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

  const b = body as {
    title?: unknown;
    blocks?: unknown;
    startedAt?: unknown;
    completedAt?: unknown;
    readiness?: unknown;
  };

  if (typeof b.title !== "string" || !b.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      title: b.title.trim(),
      startedAt: b.startedAt ? new Date(b.startedAt as string) : new Date(),
      completedAt: b.completedAt ? new Date(b.completedAt as string) : null,
      // blocks holds the prototype block shape (exercises/sets/reps/load/rpe)
      blocks: (b.blocks ?? []) as object,
      readiness: typeof b.readiness === "number" ? b.readiness : null,
    },
  });

  return NextResponse.json({ session }, { status: 201 });
}
