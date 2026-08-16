import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

/**
 * THE ATHLETE'S BEST EFFORTS — the fastest window covering each catalog
 * distance, taken from inside their recordings.
 *
 * This is the read side of the record ladder's oldest hole. A rung used to need
 * an effort logged AT the distance, because a workout summary carries no trace
 * to look inside; now the distance series lands with every match and the fastest
 * window is derived and stored on upload (SessionLap, kind `best`). This route
 * hands those rows to the sport page, which fills its rungs from them —
 * core `sportRecords`, `segmentBests`.
 *
 * GET → { bests: [{ sessionId, distanceKm, seconds }] }
 *
 * DELIBERATELY NOT PER-SPORT. A lap row does not know what sport it belongs to —
 * a session does — and teaching this route to guess would put a second,
 * divergent copy of the sport-narrowing rule behind an API boundary from the
 * one in core. So it returns the athlete's whole set and the page attributes
 * each row by session id against the slice it has already narrowed. The payload
 * is small enough for that to be the obviously right trade: a `best` row is
 * three numbers, and an athlete produces at most a handful per recording.
 *
 * Owner-only, archived workouts excluded — a hidden workout stays out of the
 * records exactly as it stays out of History.
 */

/**
 * The cap. Five rungs per road recording means this is roughly a thousand
 * recordings' worth — years of training — and it is ordered NEWEST FIRST so the
 * rows that fall off the end are the oldest. That ordering is what makes the cap
 * safe to have: a record set years ago and never beaten would be the one thing a
 * truncation must not lose, and it is also the one thing an athlete would
 * notice. If this ever starts truncating in practice it becomes a per-rung
 * `DISTINCT ON` (the fastest per distance is all the ladder reads), which is a
 * change of query rather than of shape.
 */
const MAX_BESTS = 5000;

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const rows = await prisma.sessionLap.findMany({
      where: { userId: user.id, kind: "best", archived: false, distanceKm: { not: null } },
      orderBy: { performedAt: "desc" },
      take: MAX_BESTS,
      select: { sessionId: true, distanceKm: true, durationSec: true },
    });
    return NextResponse.json({
      bests: rows.map((r) => ({
        sessionId: r.sessionId,
        distanceKm: r.distanceKm!,
        // The ladder reads whole seconds — a stored window is accurate to a
        // tenth, which is finer than any finishing time is ever quoted at.
        seconds: Math.round(r.durationSec),
      })),
    });
  } catch (e) {
    // The lap table may not exist yet (see prisma/MIGRATIONS.md — production's
    // bookkeeping is reconciled by hand). An empty set is the honest answer and
    // leaves every rung exactly as it was before segments existed; a 500 here
    // would take the whole sport page down for a feature that only ADDS rungs.
    console.error("[sessions/bests] unavailable", e);
    return NextResponse.json({ bests: [] });
  }
}
