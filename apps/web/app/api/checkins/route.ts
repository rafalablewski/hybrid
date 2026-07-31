import { NextResponse } from "next/server";
import { checkinPatchFields, readGate, placeReads, decisiveRead, QUICK_CHECKIN_METRIC } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

/**
 * READS ARE APPENDED, NOT OVERWRITTEN.
 *
 * The readiness question used to live in `Checkin.energy` alone, so answering
 * again hours later could only replace the morning's answer. Each answer is now
 * also written to `CheckinRead` with its own clock, and the day's column keeps
 * the DECISIVE read — the latest one not taken in the shadow of a session — so
 * every existing reader of that column is unaffected. The maths (which reads
 * may be taken when, and which one governs the day) is core/readiness-reads.ts.
 *
 * The table is additive, and this route treats a database that doesn't have it
 * yet as "no extra reads": the gate falls back to open, the day column keeps the
 * submitted value, and nothing 500s. Run reference/sql-checkin-reads.sql to
 * switch the second read on.
 */
type StoredRead = { value: number; loggedAt: Date };

async function readsFor(checkinId: string): Promise<StoredRead[] | null> {
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
async function lastSessionEnd(userId: string): Promise<number | null> {
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

// The athlete's own daily check-ins. GET lists newest-first; POST submits one.
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const where = { userId: me.id };
  const query = { where, orderBy: { weekOf: "desc" as const }, take: 52 };
  // Each day carries its reads — the clients place them in time and show the
  // day as a sequence rather than as one value that keeps changing.
  const checkins = await prisma.checkin
    .findMany({
      ...query,
      include: { reads: { orderBy: { loggedAt: "asc" }, select: { metric: true, value: true, loggedAt: true, sinceSessionH: true } } },
    })
    .catch(() => prisma.checkin.findMany(query));
  return NextResponse.json({ checkins });
}

const int1to5 = (v: unknown) => (typeof v === "number" && v >= 1 && v <= 5 ? Math.round(v) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const weekOf =
    typeof b.weekOf === "string" && !Number.isNaN(Date.parse(b.weekOf)) ? new Date(b.weekOf) : new Date();

  // Refining the SAME day's check-in (e.g. the Today quick-readiness tap, then
  // the "log the full picture" nudge into the guided flow) UPDATES that day's
  // row — so the coarse one-tap read is replaced by the detailed one, with no
  // duplicate and no cooldown block. Only a check-in for a NEW day is subject to
  // the 6h cooldown. Same-day is a UTC-calendar-day window around weekOf.
  const dayStart = new Date(Date.UTC(weekOf.getUTCFullYear(), weekOf.getUTCMonth(), weekOf.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const sameDay = await prisma.checkin.findFirst({
    where: { userId: me.id, weekOf: { gte: dayStart, lt: dayEnd } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  // THE GATE, SERVER-SIDE — and it decides APPEND vs EDIT rather than rejecting.
  //
  // A readiness answer becomes a NEW read once the last one has had time to mean
  // something different: four hours, or six hours after a session that hasn't
  // drained yet, whichever is later. Inside that window the same answer is a
  // CORRECTION — it updates the read already on record instead of adding a
  // second one. That distinction is the whole feature, and it is also why this
  // never 429s: the Today card locks its faces while the gate is held, but the
  // guided check-in's Edit is a deliberate "I mis-tapped", and rejecting it
  // would fail the entire submission (weight, note, every session's effort) over
  // one field.
  //
  // It replaces a flat 6h "one new day per 6 hours" cooldown that gated the
  // wrong thing in both directions: inside a day it was exempt, so a second
  // answer silently overwrote the first — and across days it blocked an athlete
  // from logging TODAY because they had back-logged yesterday an hour earlier. A
  // day can only ever hold one row, so the day itself is the only cap that
  // write needed. See core/readiness-reads.ts.
  const now = Date.now();
  const answeringReadiness = Object.prototype.hasOwnProperty.call(b, QUICK_CHECKIN_METRIC) && int1to5(b.energy) !== null;
  const sessionEnd = answeringReadiness ? await lastSessionEnd(me.id) : null;
  const stored = sameDay ? await readsFor(sameDay.id) : [];
  const last = stored?.length ? stored[stored.length - 1]! : null;
  // Only a deliberate tap on the faces CLAIMS to be a new measurement
  // (`quickCheckinPatch` sets the flag). The guided check-in prefills whatever
  // the day already holds and re-sends it on every save, so treating any
  // readiness value as a fresh answer would manufacture a second measurement
  // each time an athlete edited their note.
  const claimsNewRead = b.newRead === true;
  const appendRead =
    answeringReadiness &&
    stored != null &&
    (last == null ||
      (claimsNewRead &&
        readGate({ lastReadAt: last.loggedAt.getTime(), lastSessionEnd: sessionEnd, readsToday: stored.length, now }).open));

  const adherence = num(b.adherencePct);
  const bodyMassKg = num(b.bodyMassKg);
  // Sharing a check-in with a coach is a paid feature; free users keep it private
  // (their own personal log). Silently coerce to false rather than rejecting, so
  // a free user submitting still succeeds — just unshared.
  const sharedWithCoach = b.sharedWithCoach === true && me.entitlement === "paid";
  const full = {
    weekOf,
    bodyMassKg,
    energy: int1to5(b.energy),
    sleep: int1to5(b.sleep),
    soreness: int1to5(b.soreness),
    mood: int1to5(b.mood),
    adherencePct: adherence != null ? Math.max(0, Math.min(100, Math.round(adherence))) : null,
    note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null,
    sharedWithCoach,
  };

  // REFINING A DAY IS A PATCH, NOT A REWRITE. This wrote every column on every
  // save, so a field the sender didn't carry was stored as null — and each
  // surface sends a different subset. Re-tapping readiness in the afternoon
  // (which sends the one metric it asked about) deleted the sleep, freshness and
  // mood answered that morning; submitting the follow-up on web (whose form
  // never loaded them) deleted the day's weight, adherence and note. The
  // athlete's answers disappearing behind their back is exactly what "I filled
  // it in but it didn't save" looks like.
  //
  // So an ABSENT key now leaves the stored value alone; only a key that is
  // explicitly present may change it (present-and-null clears it deliberately).
  // A new day still writes the full row, where absent genuinely means unknown.
  // The rule lives in core beside the builders that produce these payloads, so
  // what the clients send and what the server honours are one decision.
  const patch = checkinPatchFields(full, b);

  let checkin = sameDay
    ? await prisma.checkin.update({ where: { id: sameDay.id }, data: patch })
    : await prisma.checkin.create({ data: { userId: me.id, ...full } });

  // THE READ — appended, or the one on record corrected — and the day's column
  // set to whichever read should govern it.
  //
  // `decisiveRead` picks the one training is prescribed off: the latest read NOT
  // taken in the shadow of a session. That matters in one direction in
  // particular — an athlete who logged a real recovery read in the evening, then
  // trains again late and taps "wrecked" walking out, must not have the
  // evening's reading replaced by the session talking. The lag is stamped from
  // the server's own session clock, so it is a measurement rather than something
  // the client asserts.
  if (answeringReadiness && stored) {
    const value = int1to5(b.energy)!;
    const lagH = sessionEnd != null && now >= sessionEnd ? Math.round(((now - sessionEnd) / 3_600_000) * 100) / 100 : null;
    let reads = stored.map((r) => ({ value: r.value, at: r.loggedAt.getTime() }));
    if (appendRead) {
      await prisma.checkinRead
        .create({
          data: { checkinId: checkin.id, userId: me.id, metric: QUICK_CHECKIN_METRIC, value, loggedAt: new Date(now), sinceSessionH: lagH },
        })
        .catch(() => {});
      reads = [...reads, { value, at: now }];
    } else if (last && last.value !== value) {
      // A correction: the read already on record keeps its CLOCK (that is when
      // the athlete felt it) and takes the new value. Unchanged values are left
      // alone entirely — re-sending what is already stored is not an edit.
      await prisma.checkinRead
        .updateMany({ where: { checkinId: checkin.id, metric: QUICK_CHECKIN_METRIC, loggedAt: last.loggedAt }, data: { value } })
        .catch(() => {});
      reads = [...reads.slice(0, -1), { value, at: last.loggedAt.getTime() }];
    }

    const decisive = decisiveRead(placeReads(reads, sessionEnd == null ? [] : [sessionEnd]));
    if (decisive && decisive.value !== checkin.energy) {
      checkin = await prisma.checkin.update({ where: { id: checkin.id }, data: { energy: decisive.value } });
    }
  }

  // Mirror the weigh-in into the Signal ontology (bodyMass) so the nutrition
  // engine's maintenance estimate + the smoothed bodyweight trend run on the
  // athlete's REAL weight instead of a cold-start default. Best-effort: a
  // duplicate (same week already logged) must not fail the check-in.
  if (bodyMassKg != null && bodyMassKg > 0) {
    await prisma.signal
      .create({ data: { userId: me.id, kind: "bodyMass", value: bodyMassKg, unit: "kg", source: "checkin", ts: weekOf } })
      .catch(() => {});
  }

  return NextResponse.json({ checkin }, { status: 201 });
}
