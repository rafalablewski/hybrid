import { NextResponse } from "next/server";
import { canViewResults, migrateBlocks, relationTo, sanitizeDeviceWorkout, type LoggedSession, type Visibility } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, edgesFor, blockedIdsFor } from "@/lib/social";

// THE WORKOUT BEHIND A POST — one session's full ledger, for the feed's opened
// card (core/feed-workout.ts). The feed row carries two or three top sets; this
// is what the athlete actually did, every exercise and every set.
//
// Both feed card types that come from a session — `session` and `pr` — anchor on
// the Session id (core/social.ts buildSocialFeed), so this one route serves both.
//
// PRIVACY. The same gate the rest of social uses, evaluated server-side:
//   • it's mine → always;
//   • otherwise visibility × relation (canViewResults), with a block in either
//     direction hiding the session entirely (404, like a profile).
// A session the viewer can't see never leaves the server. And the private
// post-workout reflection (note / mood / tags / feel) is NOT selected at all —
// it is owner-only by schema and must never travel with a shared workout.

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const row = await prisma.session.findUnique({
      where: { id },
      select: { id: true, userId: true, title: true, startedAt: true, completedAt: true, blocks: true, device: true, archivedAt: true },
    });
    // An archived workout has been withdrawn by its author — it's out of History
    // and out of the engines, so it's out of the feed too.
    if (!row || row.archivedAt) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (row.userId !== me.id) {
      const blocked = await blockedIdsFor(me.id);
      if (blocked.has(row.userId)) return NextResponse.json({ error: "not found" }, { status: 404 });

      const [edges, profile] = await Promise.all([
        edgesFor(me.id),
        prisma.socialProfile.findUnique({ where: { userId: row.userId }, select: { visibility: true } }),
      ]);
      const relation = relationTo(me.id, row.userId, edges);
      // No profile row yet = the app's default, followers-only. An athlete who
      // hasn't chosen is never treated as public.
      const visibility = (profile?.visibility as Visibility) ?? "followers";
      if (!canViewResults(visibility, relation)) return NextResponse.json({ error: "private" }, { status: 403 });
    }

    const session: LoggedSession = {
      id: row.id,
      title: row.title,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      blocks: migrateBlocks(row.blocks),
      // The measurement rides along, so the opened post reads what the watch
      // recorded rather than what was typed (CLAUDE.md — device truth).
      device: sanitizeDeviceWorkout(row.device),
    };
    return NextResponse.json({ session });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not found", unavailable: true }, { status: 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
