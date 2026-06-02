import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The logger's backend. Both clients (web + mobile) call this.
// Every query is scoped to the authenticated user's id — a user only ever
// reads/writes their own Session rows.

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
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
