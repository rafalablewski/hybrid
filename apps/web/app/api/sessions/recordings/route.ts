import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { deviceFingerprint } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

/**
 * EVERY SESSION THAT CARRIES A DEVICE RECORDING — the whole history, and what
 * has already been fetched out of it.
 *
 * THE BUG THIS EXISTS TO FIX: both device passes on the phone (the summary
 * repair and the stream backfill) built their work-list from `fetchSessions`,
 * which is the History list and returns the FIFTY most recent sessions. So
 * "walks the athlete's whole matched history" was true only for an athlete with
 * fewer than fifty workouts. Everyone else had a ceiling they could not see:
 * their older recordings were never repaired and their older traces were never
 * going to be fetched, however many times they synced.
 *
 * GET → { recordings: [{ id, uuid, provider, streamed, fingerprint }] }
 *
 * No blocks and no device blob — an athlete with two thousand recorded sessions
 * gets a couple of hundred kilobytes, which is what makes an UNCAPPED list
 * affordable where the History payload would not be. `streamed` is the skip
 * flag for the backfill (the trace is already stored, don't read it again), and
 * `fingerprint` is the repair pass's: it summarises what the stored recording
 * SAYS, so the phone can tell an unchanged read from a changed one without the
 * blob crossing the wire, and skip the PATCH.
 *
 * Archived sessions are excluded. A workout hidden from History stays out of
 * the analytics, so spending an athlete's battery and data plan re-reading its
 * GPS track would be work done for rows nothing will ever look at.
 */
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Only rows that actually carry a recording — a hand-logged session has no
  // uuid to look up and nothing for either pass to do.
  const rows = await prisma.session.findMany({
    where: { userId: user.id, archivedAt: null, NOT: { device: { equals: Prisma.DbNull } } },
    orderBy: { startedAt: "desc" },
    select: { id: true, device: true },
  });

  let streamed = new Set<string>();
  try {
    const have = await prisma.sessionStream.findMany({
      where: { userId: user.id },
      distinct: ["sessionId"],
      select: { sessionId: true },
    });
    streamed = new Set(have.map((r) => r.sessionId));
  } catch (e) {
    // The stream table may not exist yet (production's migration bookkeeping is
    // reconciled by hand — see prisma/MIGRATIONS.md). An empty set makes the
    // backfill TRY rather than skip; trying costs a wasted upload, skipping
    // would cost the trace forever.
    console.error("[sessions/recordings] stream index unavailable", e);
  }

  const recordings = rows
    .map((r) => {
      const d = r.device as ({ provider?: string; uuid?: string } & Record<string, unknown>) | null;
      if (!d?.uuid) return null;
      return {
        id: r.id,
        uuid: d.uuid,
        provider: d.provider ?? "apple",
        streamed: streamed.has(r.id),
        fingerprint: deviceFingerprint(d as Record<string, unknown>),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return NextResponse.json({ recordings });
}
