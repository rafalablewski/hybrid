import {
  feelReading,
  recoveryCurve,
  readinessContext,
  hoursSince,
  MIN_PAIR_GAP_H,
  type FeelReading,
  type ReadinessContext,
  type RecoveryCurve,
} from "./feel-timing";
import { RECOVERY_DUE_H, RECOVERY_WINDOW_H } from "./feel-schedule";
import { feelingFromRating, type ReadinessFeeling } from "./readiness-feeling";

/**
 * ASKING AGAIN IS NOT EDITING THE ANSWER.
 *
 * The daily check-in stored ONE readiness value per day, so the second time an
 * athlete opened the card the only thing they could do was overwrite the first
 * answer — and the card, knowing that, locked the faces once the day was
 * complete. Both halves were wrong in the same way:
 *
 *   "Flat, ninety minutes after squats" and "flat, fourteen hours later" are
 *   not one measurement someone got wrong the first time. They are two
 *   measurements, and the SECOND one is the one that should move training.
 *   Overwriting the first destroys the only thing that makes the second
 *   interpretable; refusing the second leaves the app reading a session's own
 *   disturbance as the athlete's recovery state for the rest of the day.
 *
 * The rest of the engine already knew this — `feel-timing.ts` divides a report
 * by the residual expected at its lag, `feel-schedule.ts` schedules a recovery
 * read six hours after the session, `recovery-pairs.ts` measures the athlete's
 * own clearance rate from PAIRS of reads. All of it was starved: the store
 * could hold one read a day, so a pair could almost never form.
 *
 * So a readiness answer is now an APPEND, and this module owns what that means:
 *
 *   THE GATE      when a new read is allowed, and when it is actively wanted.
 *   THE PLACEMENT each read put on the same spentness curve the session-side
 *                 reports use — no second instrument, no second maths.
 *   THE DECISIVE  which of the day's reads training is actually prescribed off.
 *   THE PAIR      what two reads of one day say about this athlete's clearance.
 *
 * Nothing here invents a curve. Readiness is the SAME scale as "how spent are
 * you", read from the other end (5 = primed = nothing to drain), so a read is
 * placed by inverting it onto spentness and handing it to `feelReading`. One
 * residual model, one recall discount, one threshold — which is the only way
 * the readiness card and the session card can be guaranteed not to disagree.
 */

const HOUR_MS = 3_600_000;

/* ── THE GATE ─────────────────────────────────────────────────────────────── */

/**
 * How far apart two reads must be to be worth taking.
 *
 * Deliberately `MIN_PAIR_GAP_H` and not a number of its own: a re-read closer
 * together than the pair model can use tells the engine NOTHING — the expected
 * residual barely moves over two hours, so the ratio is noise — and asking for
 * an answer the maths will then discard is how a training app turns into a mood
 * tracker. The cadence floor and the measurement floor are the same fact.
 */
export const MIN_RELOG_GAP_H = MIN_PAIR_GAP_H;

/**
 * How long after a session the next read is held back.
 *
 * `RECOVERY_DUE_H` — the same six hours the recovery read is scheduled at. A
 * read taken inside that window is still describing the session (by six hours
 * the fast component has largely drained: expectedResidual(6) ≈ 0.59), so
 * accepting one would hand the app a confounded answer and then start the
 * cadence clock from it, pushing the read that actually matters even later.
 *
 * This is a lock on RE-reading only. The first read of a day is always allowed,
 * whatever the clock says — an athlete who wants to log how they feel walking
 * out of the gym is telling the truth about that moment, and the card already
 * names what that reading is worth.
 */
export const POST_SESSION_LOCK_H = RECOVERY_DUE_H;

/** Reads per day, capped. With a four-hour floor the cap is nearly unreachable
 *  anyway; it exists so a pathological day can't flood the day's average. */
export const MAX_READS_PER_DAY = 4;

/** Why the gate is where it is. */
export type ReadGateReason =
  /** Nothing logged yet — the day's first read is always allowed. */
  | "first"
  /** Open on cadence: enough time has passed since the last read. */
  | "open"
  /** Open AND wanted: the recovery read on the last session has come due. */
  | "recovery"
  /** Held: the last session hasn't had time to drain. */
  | "postSession"
  /** Held: the last read is too recent to say anything new. */
  | "cadence"
  /** Held: the day already carries as many reads as it can use. */
  | "dayFull";

export interface ReadGate {
  /** May the athlete log a NEW read right now. */
  open: boolean;
  /** Is the app actively asking for one — i.e. the recovery read is owed. A
   *  gate can be open without being wanted; the card leads with WHY only when
   *  this is true. */
  wanted: boolean;
  reason: ReadGateReason;
  /** Epoch ms the gate opens. Null when it is open, or when nothing but a new
   *  day will open it. */
  opensAt: number | null;
  /** Milliseconds until it opens (0 when open). */
  msUntilOpen: number;
}

export interface ReadGateOptions {
  /** Epoch ms of the athlete's most recent readiness read TODAY. */
  lastReadAt?: number | null;
  /** Epoch ms the athlete's most recent session ended. */
  lastSessionEnd?: number | null;
  /** How many reads the day already carries. */
  readsToday?: number;
  now?: number;
}

/**
 * When the next readiness read may be logged.
 *
 * Two clocks, and the later of the two wins:
 *
 *   CADENCE   the last read + `MIN_RELOG_GAP_H`. Below that gap a second answer
 *             is not a second measurement.
 *   SESSION   the last session's end + `POST_SESSION_LOCK_H`, but ONLY while
 *             that moment is still ahead of the last read. That covers both
 *             cases with one line: trained since your last read (the recovery
 *             read is owed), and read straight after training (the read you
 *             took was the confounded one, so the useful one is still due).
 *             Once a read lands after the session has drained, the session has
 *             nothing left to say and only cadence applies.
 *
 * Worked, against the case that prompted this: session ends 09:00, athlete taps
 * "flat" at 09:30. Cadence opens 13:30, the session's recovery read is due at
 * 15:00 — so the gate opens at 15:00, and the second answer lands where it is
 * worth something instead of overwriting the first. Fourteen hours later, with
 * that read logged and nothing since, both clocks are long past: open.
 */
export function readGate(opts: ReadGateOptions = {}): ReadGate {
  const now = opts.now ?? Date.now();
  const last = typeof opts.lastReadAt === "number" && Number.isFinite(opts.lastReadAt) ? opts.lastReadAt : null;
  const end =
    typeof opts.lastSessionEnd === "number" && Number.isFinite(opts.lastSessionEnd) ? opts.lastSessionEnd : null;
  const count = opts.readsToday ?? (last == null ? 0 : 1);

  // The recovery read this session is owed, if that moment is still ahead of
  // the last answer we hold.
  const sessionDue = end != null ? end + POST_SESSION_LOCK_H * HOUR_MS : null;
  const owed = sessionDue != null && (last == null || sessionDue > last) ? sessionDue : null;
  const wanted = owed != null && now >= owed && now < (end as number) + RECOVERY_WINDOW_H * HOUR_MS;

  if (last == null) {
    return { open: true, wanted, reason: "first", opensAt: null, msUntilOpen: 0 };
  }
  if (count >= MAX_READS_PER_DAY) {
    return { open: false, wanted: false, reason: "dayFull", opensAt: null, msUntilOpen: Infinity };
  }

  const cadenceAt = last + MIN_RELOG_GAP_H * HOUR_MS;
  const opensAt = owed != null ? Math.max(cadenceAt, owed) : cadenceAt;
  if (now >= opensAt) {
    return { open: true, wanted, reason: wanted ? "recovery" : "open", opensAt: null, msUntilOpen: 0 };
  }
  return {
    open: false,
    wanted: false,
    reason: owed != null && owed > cadenceAt ? "postSession" : "cadence",
    opensAt,
    msUntilOpen: opensAt - now,
  };
}

/** i18n key for the line under a held gate — why the faces aren't tappable. */
export const READ_GATE_KEY: Record<ReadGateReason, string | null> = {
  first: null,
  open: null,
  recovery: "w.home.today.gateRecovery",
  postSession: "w.home.today.gatePostSession",
  cadence: "w.home.today.gateCadence",
  dayFull: "w.home.today.gateDayFull",
};

/* ── THE PLACEMENT ────────────────────────────────────────────────────────── */

/** One readiness answer, as stored. */
export interface ReadinessRead {
  /** 1–5, the readiness metric as written (5 = primed). */
  value: number;
  /** Epoch ms the answer was given. */
  at: number;
}

/**
 * Readiness on the spentness scale.
 *
 * The two instruments run in opposite directions — 5 means "primed" on the
 * readiness picker and "wrecked" on the fatigue question — so one is the other
 * reflected: 6 − v. Everything downstream then reads ONE scale, which is why a
 * readiness read can be handed straight to `feelReading` and compared with a
 * session's own report without a second calibration anywhere.
 *
 * Note the picker's four faces write 2…5, so a readiness read tops out at 4/5
 * spent. That is correct rather than a rounding loss: "wrecked" on a four-level
 * picker is not a claim on the very top of a five-point scale, and the guided
 * check-in's full 1–5 is still available for the athlete who means it.
 */
export function spentFromReadiness(value: number): number {
  return 6 - value;
}

/** A read placed in time against the session before it. */
export interface PlacedRead {
  value: number;
  at: number;
  feeling: ReadinessFeeling;
  /** Hours since the last session that ended BEFORE this read; null when the
   *  athlete hadn't trained, or when the session's clock is unknown. */
  hoursSinceSession: number | null;
  context: ReadinessContext;
  /** The read on the shared spentness curve — cost, weight, lag class. */
  reading: FeelReading;
  /**
   * True while the session itself is still the loudest thing in the answer
   * (inside `READ_BOUNDS.immediate`). A confounded read is kept, shown and
   * stored — it is simply not what training is prescribed off.
   */
  confounded: boolean;
}

/**
 * Place each read against the last session that ended before it.
 *
 * `sessionEnds` is every session end the client holds, in any order. A read
 * with no session before it is "rested" — an answer about the athlete rather
 * than about a workout — and is placed with a null lag, which `feelReading`
 * already degrades to the raw report rather than guessing.
 */
export function placeReads(reads: ReadinessRead[], sessionEnds: number[] = []): PlacedRead[] {
  const ends = sessionEnds.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  const out: PlacedRead[] = [];
  for (const r of reads) {
    if (!Number.isFinite(r.at)) continue;
    if (!Number.isFinite(r.value) || r.value < 1 || r.value > 5) continue;
    let prev: number | null = null;
    for (const e of ends) {
      if (e <= r.at) prev = e;
      else break;
    }
    const lag = prev == null ? null : hoursSince(prev, r.at);
    const reading = feelReading(spentFromReadiness(r.value), lag);
    if (!reading) continue;
    const context = readinessContext(lag);
    out.push({
      value: r.value,
      at: r.at,
      feeling: feelingFromRating(r.value),
      hoursSinceSession: lag,
      context,
      reading,
      confounded: context === "postSession",
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ── THE DECISIVE READ ────────────────────────────────────────────────────── */

/**
 * The read the day is judged on.
 *
 * The LATEST read that isn't confounded by having been taken minutes after
 * training; if every read is confounded, the latest one, because a confounded
 * answer is still better than no answer and the load factor it drives is
 * modest.
 *
 * Latest rather than an average, deliberately. Averaging "wrecked at 09:30" with
 * "good at 20:00" produces a middling number describing neither moment, and the
 * whole point of the second read is that it SUPERSEDES the first as a statement
 * about the athlete's current state. The first read is not discarded — it is
 * what makes the second one measurable (see `readClearance`) — it just doesn't
 * get a vote on how ready you are now.
 */
export function decisiveRead(reads: PlacedRead[]): PlacedRead | null {
  if (!reads.length) return null;
  const clean = reads.filter((r) => !r.confounded);
  const pool = clean.length ? clean : reads;
  return pool.reduce((best, r) => (r.at > best.at ? r : best));
}

/** The feeling training should be prescribed off today — the decisive read's,
 *  or null when the day carries no read at all. */
export function decisiveFeeling(reads: PlacedRead[]): ReadinessFeeling | null {
  return decisiveRead(reads)?.feeling ?? null;
}

/** Which way the day went. */
export type ReadTrend = "climbing" | "steady" | "sinking";

export interface ReadDayTrend {
  trend: ReadTrend;
  first: PlacedRead;
  last: PlacedRead;
  /** Levels gained (+) or lost (−) between the first read and the last. */
  delta: number;
}

/** How the day moved between its first read and its last. Null until there are
 *  two reads — one read has no direction. */
export function readTrend(reads: PlacedRead[]): ReadDayTrend | null {
  if (reads.length < 2) return null;
  const first = reads[0]!;
  const last = reads[reads.length - 1]!;
  const delta = last.value - first.value;
  return { trend: delta > 0 ? "climbing" : delta < 0 ? "sinking" : "steady", first, last, delta };
}

export const READ_TREND_KEY: Record<ReadTrend, string> = {
  climbing: "w.home.today.trendClimbing",
  steady: "w.home.today.trendSteady",
  sinking: "w.home.today.trendSinking",
};

/* ── THE PAIR ─────────────────────────────────────────────────────────────── */

/**
 * How much a readiness pair counts against a session-side pair.
 *
 * The session card asks "how spent are you" about the session; the readiness
 * card asks how ready you are for the NEXT one, and the answer carries sleep, a
 * bad day at work and yesterday's session along with it. Same scale, same
 * curve, noisier instrument — so the pair is real evidence at a discount rather
 * than either being thrown away or being trusted like a direct report.
 */
export const READINESS_PAIR_WEIGHT = 0.7;

/**
 * What two reads around one session say about this athlete's clearance rate.
 *
 * The pair is the day's first read (taken while the session was still present)
 * against its last (taken once it should have drained), handed to the SAME
 * `recoveryCurve` the session-side pairs use. Every guard there applies
 * unchanged: a four-hour minimum gap, both lags known, and an immediate read of
 * at least 3/5 spent — an athlete who walked out fine has nothing to drain, and
 * dividing a small number by a small number would otherwise manufacture a
 * verdict.
 *
 * Returns null whenever the day can't support one, which on most days it can't.
 */
export function readClearance(reads: PlacedRead[]): RecoveryCurve | null {
  if (reads.length < 2) return null;
  const first = reads[0]!;
  const last = reads[reads.length - 1]!;
  const curve = recoveryCurve(first.reading, last.reading);
  if (!curve) return null;
  return { ...curve, weight: Math.round(curve.weight * READINESS_PAIR_WEIGHT * 1000) / 1000 };
}

/* ── FEEDING THE ENGINE ───────────────────────────────────────────────────── */

/**
 * The shape `RecoveryReport` needs from us. Declared structurally rather than
 * imported so this module stays free of the engines layer (which imports the
 * feel model, not the other way round).
 */
export interface ReadReport {
  date: string;
  soreness?: number | null;
  sleep?: number | null;
  energy?: number | null;
  mood?: number | null;
  loggedAt?: string | null;
}

/**
 * A day's check-in expanded into the reports the engine should see.
 *
 * ONE report carries the day: its freshness, sleep and mood — answered once —
 * plus the DECISIVE read's readiness value and the time that read was taken, so
 * the day's canonical answer is the one that should govern it rather than
 * whichever row was written last.
 *
 * Every OTHER read is emitted as a report of its own carrying only readiness
 * and its own timestamp. That is what lets `athleteClearance` see a morning
 * read and an evening read as two reads of one session instead of one row it
 * has to guess about — and it is why the other three metrics are deliberately
 * absent from those extra reports: freshness was answered once, and repeating
 * it per read would count one answer three times.
 *
 * Consumers that average over WINDOWS must still normalize per day (see
 * `adaptLandmarks`, which weights each day to 1 regardless of read count) —
 * a training day with three reads must not outvote a rest day with one.
 */
export function readReports(day: ReadReport, reads: PlacedRead[]): ReadReport[] {
  if (!reads.length) return [day];
  const decisive = decisiveRead(reads)!;
  const base: ReadReport = {
    ...day,
    energy: decisive.value,
    loggedAt: new Date(decisive.at).toISOString(),
  };
  const others = reads
    .filter((r) => r.at !== decisive.at)
    .map<ReadReport>((r) => ({ date: day.date, energy: r.value, loggedAt: new Date(r.at).toISOString() }));
  return [base, ...others];
}
