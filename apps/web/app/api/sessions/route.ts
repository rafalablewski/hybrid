import { NextResponse } from "next/server";
import { migrateBlocks, exerciseNameAliasMap, sanitizeNote, sanitizeMood, sanitizeTags, sanitizeFeelLevel, sanitizeSessionBlocks } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { getCachedPublishedExercises } from "@/lib/cache";
import { projectSessionSafely } from "@/lib/session-projection";
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
  // Canonicalize logged exercise names to their CURRENT name before returning —
  // so a rename (a built-in one, or an admin edit that kept the old name as an
  // alias) shows up in every summary, history row and analytic for BOTH clients
  // (mobile reads this same endpoint), with no data migration. The alias map is
  // the built-in rename breadcrumbs folded with the cached admin library's
  // aliases; migrateBlocks applies it while it upgrades pre-split cardio blocks.
  const aliasMap = exerciseNameAliasMap(await getCachedPublishedExercises());
  const sessions = rows.map((s) => ({ ...s, blocks: migrateBlocks(s.blocks, aliasMap) }));
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
    feel?: unknown;
    fatigue?: unknown;
  };

  if (typeof b.title !== "string" || !b.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // THE CREATE PATH IS CHECKED TOO, and it was not.
  //
  // The old comment here said this route "stores what our own logger built", so
  // the blocks went into the column verbatim. That was never a guarantee — it is
  // an HTTP endpoint, and even the real logger passes on whatever the athlete
  // typed. A 70 000 kg bench press or a 5 200 km swim landed in the document and
  // from there into tonnage, e1RM, mileage, training load, ACWR, readiness and
  // the cohort norms, where one typo moves a whole history and nothing
  // downstream can tell it apart from a fact.
  //
  // Same sanitiser as the edit route, so there is ONE definition of a storable
  // workout: an impossible FIGURE is dropped and the session is kept (losing a
  // finished workout over a slipped finger punishes the athlete far harder than
  // losing the one number), while a malformed SHAPE is a 400.
  const blocks = sanitizeSessionBlocks(b.blocks ?? []);
  if (!blocks) return NextResponse.json({ error: "invalid blocks" }, { status: 400 });

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      title: b.title.trim(),
      startedAt: b.startedAt ? new Date(b.startedAt as string) : new Date(),
      completedAt: b.completedAt ? new Date(b.completedAt as string) : null,
      // The sanitised block shape (exercises/sets/reps/load/rpe) — see above.
      blocks: blocks as unknown as object,
      readiness: typeof b.readiness === "number" ? b.readiness : null,
      // Private post-workout reflection (owner-only).
      note: sanitizeNote(b.note),
      mood: sanitizeMood(b.mood),
      tags: sanitizeTags(b.tags),
      // Post-workout self-report — normally PATCHed from the Wrapped after the
      // save, but accepted here too so a client that already has the answer
      // (an import, or a finish flow that asked first) doesn't need two calls.
      feel: sanitizeFeelLevel(b.feel),
      fatigue: sanitizeFeelLevel(b.fatigue),
      // Stamped only when an answer actually arrived with the create — see the
      // PATCH route for why the server, not the client, owns this timestamp.
      feelLoggedAt:
        sanitizeFeelLevel(b.feel) != null || sanitizeFeelLevel(b.fatigue) != null ? new Date() : null,
    },
  });

  // Project the document into the per-set fact table — one row per set, one per
  // timed effort, so the workout is queryable and not just storable. AFTER the
  // create and never inside it: the athlete's session is already safe, and a
  // derived table must not be able to fail the logging path (see
  // lib/session-projection.ts).
  await projectSessionSafely(session);

  return NextResponse.json({ session }, { status: 201 });
}
