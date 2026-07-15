import { NextResponse } from "next/server";
import { migrateBlocks, sanitizeNote, sanitizeMood, sanitizeTags } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
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

  // Bound the write: cap the body (a workout is large but not unbounded) and
  // throttle per-IP so the core logging path can't be used for storage/DB-bloat
  // abuse. 256 KB comfortably fits a long, detailed session.
  const limited = await rateLimit(request, { key: "sessions-write", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = await readJsonLimited<Record<string, unknown>>(request, 256 * 1024);
  if (parsed.error) return parsed.error;

  const b = parsed.data as {
    title?: unknown;
    blocks?: unknown;
    startedAt?: unknown;
    completedAt?: unknown;
    readiness?: unknown;
    note?: unknown;
    mood?: unknown;
    tags?: unknown;
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
      // Private post-workout reflection (owner-only).
      note: sanitizeNote(b.note),
      mood: sanitizeMood(b.mood),
      tags: sanitizeTags(b.tags),
    },
  });

  return NextResponse.json({ session }, { status: 201 });
}
