import { QUICK_CHECKIN_METRIC } from "@hybrid/core";
import { prisma } from "@/lib/db";

/**
 * The two facts every readiness write needs — the day's reads, and the clock
 * the lag is measured from.
 *
 * They lived inside /api/checkins' POST until the withdraw route needed the
 * same pair. Two copies of "what does this day already hold" is how the append
 * path and the undo path start disagreeing about what the day holds.
 */

export type StoredRead = { value: number; loggedAt: Date };

/**
 * The reads on record for one check-in, oldest first.
 *
 * Null — as distinct from an empty array — means the CheckinRead table isn't
 * there yet (reference/sql-checkin-reads.sql not run). Callers degrade rather
 * than fail: the gate falls back to open, the day's column keeps the submitted
 * value, and nothing 500s.
 */
export async function readsFor(checkinId: string): Promise<StoredRead[] | null> {
  try {
    return await prisma.checkinRead.findMany({
      where: { checkinId, metric: QUICK_CHECKIN_METRIC },
      orderBy: { loggedAt: "asc" },
      select: { value: true, loggedAt: true },
    });
  } catch {
    return null; // table not migrated yet — degrade, don't fail
  }
}

/** When the athlete's most recent session ended — the clock the gate and the
 *  lag are measured from. Server-side so a client can't move it. */
export async function lastSessionEnd(userId: string): Promise<number | null> {
  const s = await prisma.session
    .findFirst({
      where: { userId, startedAt: { lte: new Date() } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, completedAt: true },
    })
    .catch(() => null);
  if (!s) return null;
  const end = (s.completedAt ?? s.startedAt).getTime();
  return Number.isFinite(end) ? end : null;
}

/** The UTC-calendar-day window `weekOf` falls in — the same window the POST
 *  uses to decide "is this a refinement of a day already on record". */
export function dayWindow(weekOf: Date): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(Date.UTC(weekOf.getUTCFullYear(), weekOf.getUTCMonth(), weekOf.getUTCDate()));
  return { dayStart, dayEnd: new Date(dayStart.getTime() + 86_400_000) };
}
