import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

/**
 * WHICH SESSIONS ALREADY HAVE THEIR RECORDING — the phone's to-do list.
 *
 * Streams only started landing when the feature shipped, so every workout the
 * athlete matched or imported BEFORE that has a summary and no trace. The trace
 * is usually still on their phone (Apple Health keeps the recording, and the
 * session stores the store's own id for it), so it can be fetched and uploaded
 * after the fact — see the mobile `backfillWorkoutStreams`.
 *
 * That backfill needs to know what NOT to re-read, because reading a GPS track
 * out of HealthKit is slow and re-uploading one costs the athlete's data plan
 * for nothing. This is the smallest possible answer: the ids it can skip.
 *
 * GET → { sessionIds: string[] }
 *
 * Ids only — no figures, no arrays. The response for an athlete with a thousand
 * recorded sessions is a few tens of kilobytes, which is what makes it safe to
 * call on every sync.
 */

/** Above this many recorded sessions the backfill is long finished, and a
 *  bigger list would cost more to send than the check saves. */
const MAX_IDS = 5000;

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const rows = await prisma.sessionStream.findMany({
      where: { userId: user.id },
      // One session holds several streams (heart rate, route, distance…) and the
      // caller only asks "does this one have anything at all", so the DISTINCT
      // is the whole query — without it a 2-hour ride returns five identical ids.
      distinct: ["sessionId"],
      orderBy: { performedAt: "desc" },
      take: MAX_IDS,
      select: { sessionId: true },
    });
    return NextResponse.json({ sessionIds: rows.map((r) => r.sessionId) });
  } catch (e) {
    // The table may not exist yet (production's migration bookkeeping is
    // reconciled by hand — see prisma/MIGRATIONS.md). An empty list is the
    // honest answer: the backfill then believes nothing is stored, tries, and
    // the upload itself fails harmlessly. A 500 here would stop the daily sync.
    console.error("[sessions/streamed] unavailable", e);
    return NextResponse.json({ sessionIds: [] });
  }
}
