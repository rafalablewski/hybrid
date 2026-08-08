import { NextResponse } from "next/server";
import { placeReads, decisiveRead, undoableRead, READ_UNDO_MIN, QUICK_CHECKIN_METRIC } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { readsFor, lastSessionEnd, dayWindow } from "@/lib/checkin-reads";

/**
 * TAKING BACK A READ THAT WAS NEVER MEANT.
 *
 * Every other write in this area APPENDS — that is the whole point of
 * core/readiness-reads.ts, and the reason the day's record can be trusted. This
 * is the one exception, and it is scoped so tightly that it doesn't dent the
 * rule: only the day's LAST read, only within `READ_UNDO_MIN` of the moment it
 * was given, only by the athlete who gave it.
 *
 * It exists because the four faces are a one-tap target in a scrolling card, so
 * they get brushed — and everything downstream of a tap made that permanent:
 * the read is appended, the gate shuts for four hours behind it, and the read
 * goes on to scale the next session's load. A mis-tap is not a measurement, and
 * an app that cannot be told so is asking the athlete to train off it.
 *
 * Withdrawing is not correcting. The value isn't edited and the clock isn't
 * moved; the row goes, and the day's column falls back to whichever read now
 * governs it — or to null, when the withdrawn read was the day's only one.
 */
export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const weekOf =
    typeof b.weekOf === "string" && !Number.isNaN(Date.parse(b.weekOf)) ? new Date(b.weekOf) : new Date();

  // The same UTC-calendar-day window the POST writes into, so "undo what I just
  // tapped" and "the tap" always address one row.
  const { dayStart, dayEnd } = dayWindow(weekOf);
  const checkin = await prisma.checkin.findFirst({
    where: { userId: me.id, weekOf: { gte: dayStart, lt: dayEnd } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!checkin) return NextResponse.json({ error: "not found" }, { status: 404 });

  const stored = await readsFor(checkin.id);
  // Table not migrated: there is no per-read row to withdraw, so the day's
  // column IS the answer and removing it would be an edit, not an undo.
  if (stored == null) return NextResponse.json({ error: "unavailable" }, { status: 409 });
  if (!stored.length) return NextResponse.json({ error: "not found" }, { status: 404 });

  // THE WINDOW, ON THE SERVER'S OWN CLOCK. The client shows the affordance off
  // the same rule, but a device whose clock is hours out — or a request replayed
  // later — must not be able to reach back into the record.
  const now = Date.now();
  const target = undoableRead(stored.map((r) => ({ at: r.loggedAt.getTime(), loggedAt: r.loggedAt })), now);
  if (!target) return NextResponse.json({ error: "too late", windowMin: READ_UNDO_MIN }, { status: 409 });

  await prisma.checkinRead.deleteMany({
    where: { checkinId: checkin.id, metric: QUICK_CHECKIN_METRIC, loggedAt: target.loggedAt },
  });

  // WHAT THE DAY READS AS NOW. The remaining reads decide it, through the same
  // `decisiveRead` the append path uses — an earlier read that was superseded
  // becomes the day's answer again, and a day left with no read at all goes
  // back to having none rather than keeping the withdrawn value in its column.
  const remaining = (await readsFor(checkin.id)) ?? [];
  const sessionEnd = await lastSessionEnd(me.id);
  const decisive = decisiveRead(
    placeReads(
      remaining.map((r) => ({ value: r.value, at: r.loggedAt.getTime() })),
      sessionEnd == null ? [] : [sessionEnd],
    ),
  );
  const updated = await prisma.checkin.update({
    where: { id: checkin.id },
    data: { energy: decisive ? decisive.value : null },
  });

  return NextResponse.json({ checkin: updated, reads: remaining.length });
}
