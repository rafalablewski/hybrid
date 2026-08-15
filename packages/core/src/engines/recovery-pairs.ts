import type { LoggedSession } from "./session";
import type { RecoveryReport } from "./landmark-adapt";
import { sorenessFromCheckin } from "../checkin-scales";
import {
  feelReading,
  hoursAfterSession,
  recoveryCurve,
  recoveryIndex,
  MIN_PAIR_GAP_H,
  READ_BOUNDS,
  type RecoveryCurve,
  type RecoveryIndex,
} from "../feel-timing";
import { readPairCurve, readReports, placeReads } from "../readiness-reads";
import { QUICK_CHECKIN_METRIC } from "../checkin-flow";
import { RECOVERY_WINDOW_H } from "../feel-schedule";
import { heatSittings, HEAT_EDGE_GRACE_MIN, HEAT_SESSION_MIN_EQUIV, type HeatSignalRow } from "./heat";

/**
 * MATCHING THE TWO READS BACK UP.
 *
 * `feel-timing.ts` knows what a pair of reads MEANS. This is the boring part
 * that finds the pairs: which check-in is the follow-up to which session.
 *
 * The rule that matters is the exclusion, not the matching. A recovery read is
 * only about one session if nothing else happened in between — train Monday
 * evening, train again Tuesday morning, check in Tuesday lunchtime, and that
 * check-in is reporting on two sessions stacked on top of each other. Reading it
 * as Monday's drain would blame Monday for Tuesday's work and quietly conclude
 * the athlete recovers badly. So a pair is dropped the moment a second session
 * lands inside its gap.
 *
 * What survives is conservative by design: on a heavy training week, most days
 * produce no pair at all. That is correct. The clearance estimate is allowed to
 * be slow to arrive; it is not allowed to be wrong.
 */

const HOUR_MS = 3_600_000;

/* ── THE INPUT SIDE: CHECK-IN ROWS → RECOVERY REPORTS ──────────────────────── */

/** A stored check-in, as either client or server holds it. */
export interface CheckinRow {
  /** The day the check-in covers. Legacy column name. */
  weekOf: string;
  /** The `soreness` column AS STORED, which is FRESHNESS — see RecoveryReport. */
  soreness?: number | null;
  sleep?: number | null;
  energy?: number | null;
  mood?: number | null;
  createdAt?: string | null;
  /** Every readiness answer the day carries (CheckinRead). */
  reads?: { metric?: string | null; value: number; loggedAt: string }[] | null;
}

/**
 * A DAY IS EVERY READ IT CARRIES, NOT ONE VALUE.
 *
 * The readiness card asks again once a session has drained, so a day can hold
 * "wrecked at 09:30" and "good at 22:00" — which is precisely the pair
 * `athleteClearance` and `saunaClearance` need, and which one stored value could
 * never express. `readReports` gives the day its DECISIVE read (freshness, sleep
 * and mood travel with it, answered once) and emits the others as timed reads of
 * their own.
 *
 * This lives in core rather than in a client hook because BOTH sides need it:
 * the phone renders the athlete's own clearance split, and the admin Engine Room
 * has to be able to check that figure against the same inputs. Writing the
 * mapping twice is how the two would come to disagree about one athlete.
 *
 * WHAT `sessionEnds` ACTUALLY DOES, since it is easy to assume more: it can only
 * FILTER. `placeReads` works out each answer's lag, context and reading, and
 * `readReports` then emits just { date, energy, loggedAt } — so the session
 * clock cannot change what a surviving read looks like, only drop one whose
 * reading the curve refuses to give. Pass it when you have it; a caller without
 * a session list is not silently getting different reports for the reads that
 * survive. (Guarded by a test, because the opposite is the natural assumption.)
 */
export function recoveryReports(checkins: CheckinRow[], sessionEnds: number[] = []): RecoveryReport[] {
  return checkins.flatMap((c) => {
    const day: RecoveryReport = {
      date: c.weekOf,
      soreness: c.soreness,
      sleep: c.sleep,
      energy: c.energy,
      mood: c.mood,
      loggedAt: c.createdAt ?? null,
    };
    const rows = (c.reads ?? []).filter((r) => (r.metric ?? QUICK_CHECKIN_METRIC) === QUICK_CHECKIN_METRIC);
    if (rows.length < 2) return [day];
    return readReports(
      day,
      placeReads(rows.map((r) => ({ value: r.value, at: Date.parse(r.loggedAt) })), sessionEnds),
    ) as RecoveryReport[];
  });
}

/** Session end instants, the shape `recoveryReports` wants them in. */
export function sessionEndTimes(sessions: ClearanceSession[]): number[] {
  return sessions
    .map((s) => Date.parse(s.completedAt ?? s.startedAt ?? ""))
    .filter((t) => Number.isFinite(t));
}

export interface PairOptions {
  now?: number;
  /** How far back to look, days. */
  days?: number;
  /**
   * The athlete's `sauna` / `saunaTemp` rows. Supplying them TAGS each pair
   * with whether heat fell inside its gap; omitting them leaves `heat`
   * undefined, so "not measured" stays distinguishable from "no heat".
   */
  heatSignals?: HeatSignalRow[];
}

/**
 * ALL A PAIR NEEDS FROM A SESSION — stated as a type rather than left implicit.
 *
 * A `LoggedSession` satisfies this, so every existing caller is unchanged. It
 * exists because the admin console has to send sessions over the wire to compute
 * the clearance split, and shipping thirty sessions' worth of BLOCKS for six
 * fields would be a support-read carrying far more of an athlete's training than
 * the question needs. Naming the requirement makes the minimal projection
 * type-checked rather than hopeful.
 */
export type ClearanceSession = Pick<
  LoggedSession,
  "id" | "title" | "startedAt" | "completedAt" | "fatigue" | "feelLoggedAt"
>;

/** One matched pair, with enough context to explain itself in the UI. */
export interface RecoveryPair {
  sessionId: string;
  sessionTitle: string;
  /** ISO of the session end the pair is measured from. */
  at: string;
  curve: RecoveryCurve;
  /**
   * True when a heat sitting fell BETWEEN the session end and the recovery
   * read — i.e. this is a measurement of clearance with heat in the middle of
   * it. Only sittings clearing HEAT_SESSION_MIN_EQUIV count: a token five
   * minutes in a cool cabin would otherwise relabel a pair without having
   * plausibly changed it. Undefined when no heat log was supplied at all,
   * which is not the same as false.
   *
   * The window opens HEAT_EDGE_GRACE_MIN BEFORE the session end, and that
   * matters more than it looks. The sitting's instant is typed and the end is
   * measured by a watch that gets stopped whenever the athlete remembers —
   * routinely so, since the recording may not be imported until that evening —
   * so a sauna taken straight after training can land minutes before the end
   * it plainly followed. Without the grace that pair does not merely lose a
   * sample: it lands in the WITHOUT-heat bucket, which is the one outcome worse
   * than dropping it, because the control side then contains the treatment.
   *
   * The grace never reaches back past the session's own START, so on a short
   * session it cannot relabel a PRE-workout sauna as heat taken after one.
   */
  heat?: boolean;
}

const endMs = (s: ClearanceSession): number => {
  const end = s.completedAt ? Date.parse(s.completedAt) : NaN;
  if (Number.isFinite(end)) return end;
  const start = Date.parse(s.startedAt);
  return Number.isFinite(start) ? start : NaN;
};

/**
 * Every session whose immediate read can be matched to a later recovery read.
 *
 * The immediate read is the session's own `fatigue` answer; the recovery read is
 * the check-in's spentness, pooled from freshness and energy exactly as the MRV
 * estimator pools it, so the two sides of the ratio are the same instrument
 * measured twice rather than two instruments compared.
 */
export function pairReads(
  sessions: ClearanceSession[],
  recovery: RecoveryReport[] = [],
  opts: PairOptions = {},
): RecoveryPair[] {
  // Heat sittings that were big enough to plausibly matter, as timestamps.
  const heatAt = opts.heatSignals
    ? heatSittings(opts.heatSignals)
        .filter((h) => h.equivMin >= HEAT_SESSION_MIN_EQUIV)
        .map((h) => Date.parse(h.ts))
        .filter((t) => Number.isFinite(t))
    : null;
  const now = opts.now ?? Date.now();
  const since = now - (opts.days ?? 56) * 24 * HOUR_MS;

  const ends = sessions
    .map((s) => ({ s, end: endMs(s) }))
    .filter((x) => Number.isFinite(x.end))
    .sort((a, b) => a.end - b.end);
  const endTimes = ends.map((x) => x.end);

  // Check-ins that carry a spentness answer and a write time, in order.
  const reads = recovery
    .map((r) => {
      const at = r.loggedAt ? Date.parse(r.loggedAt) : Date.parse(r.date);
      const sore = sorenessFromCheckin(r.soreness);
      const energy =
        typeof r.energy === "number" && Number.isFinite(r.energy) && r.energy >= 1 && r.energy <= 5 ? r.energy : null;
      const parts: number[] = [];
      if (sore !== null) parts.push(sore);
      if (energy !== null) parts.push(6 - energy);
      return { at, spent: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null };
    })
    .filter((r) => Number.isFinite(r.at) && r.spent !== null)
    .sort((a, b) => a.at - b.at);

  const out: RecoveryPair[] = [];

  for (const { s, end } of ends) {
    if (end < since || end > now) continue;

    // The next session to start, if any — the pair may not reach past it.
    const nextEnd = endTimes.find((t) => t > end) ?? Infinity;

    // Where the heat window opens: the edge grace, but never earlier than the
    // session STARTED. The grace exists to absorb one clock artefact — a watch
    // stopped after the athlete had already left for the sauna — and on a long
    // session `end − 30 min` is comfortably mid-session, so it absorbs only
    // that. On a SHORT one (a 15-minute run) it would reach back past the start
    // and quietly relabel a sauna taken BEFORE training as heat taken after it,
    // which is not a clock artefact but a different sitting. Clamping to the
    // start keeps the grace what it claims to be.
    const started = Date.parse(s.startedAt);
    const heatFrom = Number.isFinite(started) && started < end
      ? Math.max(end - HEAT_EDGE_GRACE_MIN * 60_000, started)
      : end - HEAT_EDGE_GRACE_MIN * 60_000;

    // THE IMMEDIATE SIDE, preferred from the session's own answer.
    let immediateLag = typeof s.fatigue === "number"
      ? hoursAfterSession(s.completedAt ?? s.startedAt, s.feelLoggedAt)
      : null;
    let immediate = immediateLag == null || typeof s.fatigue !== "number" ? null : feelReading(s.fatigue, immediateLag);
    // …or, failing that, from a CHECK-IN READ taken while the session was still
    // present. Before the day could hold more than one read this branch was
    // unreachable — a day had one answer, and if it landed in the gym there was
    // nothing left to pair it with. Now an athlete who skips the post-workout
    // card but taps the readiness faces twice still measures their own
    // clearance. It is the same instrument on the same curve, so it is the same
    // ratio — carried at a discount, because a readiness answer also carries
    // sleep and the rest of the day with it (READINESS_PAIR_WEIGHT).
    let fromReads = false;
    let afterAt = end;
    if (!immediate) {
      for (const r of reads) {
        if (r.at <= end) continue;
        if (r.at >= nextEnd) break;
        const lag = hoursAfterSession(end, r.at);
        if (lag == null) continue;
        if (lag >= READ_BOUNDS.immediate) break; // reads are ordered: nothing earlier remains
        const reading = feelReading(r.spent!, lag);
        if (!reading) break;
        immediate = reading;
        immediateLag = lag;
        fromReads = true;
        afterAt = r.at;
        break;
      }
    }
    if (!immediate || immediateLag == null) continue;

    for (const r of reads) {
      if (r.at <= afterAt) continue;
      const lag = hoursAfterSession(end, r.at);
      if (lag == null) continue;
      if (lag > RECOVERY_WINDOW_H) break; // reads are ordered; nothing later qualifies
      if (lag - immediateLag < MIN_PAIR_GAP_H) continue;
      // A second session inside the gap contaminates the read — see the header.
      if (r.at >= nextEnd) break;

      const later = feelReading(r.spent!, lag);
      const curve = fromReads ? readPairCurve(immediate, later) : recoveryCurve(immediate, later);
      if (curve) {
        out.push({
          sessionId: s.id,
          sessionTitle: s.title,
          at: new Date(end).toISOString(),
          curve,
          // The window the pair actually measures: from the session end to the
          // recovery read. Heat outside it did not happen during this clearance
          // — with the edge grace, because "before the end" is a clock artefact
          // at that boundary and not a fact about the sauna (see `heat` above).
          ...(heatAt ? { heat: heatAt.some((t) => t > heatFrom && t <= r.at) } : {}),
        });
      }
      break; // one recovery read per session — the first that qualifies
    }
  }

  return out;
}

/**
 * The athlete's measured recovery rate against the population decay curve.
 * Neutral with zero confidence until at least two clean pairs exist.
 */
export function athleteClearance(
  sessions: ClearanceSession[],
  recovery: RecoveryReport[] = [],
  opts: PairOptions = {},
): RecoveryIndex & { samples: RecoveryPair[] } {
  const samples = pairReads(sessions, recovery, opts);
  return { ...recoveryIndex(samples.map((p) => p.curve)), samples };
}


/* ── PHASE 4: REPLACING THE LITERATURE CONSTANT WITH A MEASUREMENT ─────────── */

/** The athlete's own clearance, split by whether heat fell inside the gap. */
export interface HeatClearance {
  withHeat: RecoveryIndex;
  withoutHeat: RecoveryIndex;
  /**
   * withHeat.index − withoutHeat.index. NEGATIVE means faster after heat, since
   * the index is a ratio against the population decay curve and lower is better
   * (CLEARANCE_FAST is 0.85). Zero when either side is short of evidence.
   */
  delta: number;
  /** min of the two sides' confidence — a comparison is only as good as its
   *  weaker half, and a strong reading against nothing is not a comparison. */
  confidence: number;
  withSamples: RecoveryPair[];
  withoutSamples: RecoveryPair[];
}

/**
 * DOES HEAT ACTUALLY HELP *THIS* ATHLETE?
 *
 * Every constant in engines/heat.ts is a prior drawn from published research on
 * other people. This is the instrument that can replace it with a measurement,
 * and it needs no new data collection: `pairReads` already matches an immediate
 * post-session read to a later recovery read and is rigorous about what it
 * throws away (a second session inside the gap contaminates the pair, so the
 * pair is dropped). Tagging each surviving pair with whether heat fell inside
 * its gap splits the athlete's own history in two.
 *
 * IT IS DELIBERATELY SLOW TO SPEAK. Both sides must clear MIN_RECOVERY_PAIRS
 * independently, which in practice means four to six weeks — and it returns a
 * flat, zero-confidence result until then rather than a direction it cannot
 * support. That is the same standard the estimator it is built on already
 * holds itself to: the clearance estimate is allowed to be slow to arrive; it
 * is not allowed to be wrong.
 *
 * WHY A DIFFERENCE OF INDICES rather than a ratio of them: both sides are
 * already ratios against the same population curve, so subtracting them leaves
 * a number in the units the rest of the clearance model speaks (CLEARANCE_FAST
 * / CLEARANCE_SLOW bracket 1.0 by ±0.15), and a caller can compare `delta`
 * against that same band without a second scale to learn.
 */
export function saunaClearance(
  sessions: ClearanceSession[],
  recovery: RecoveryReport[] = [],
  heatSignals: HeatSignalRow[] = [],
  opts: PairOptions = {},
): HeatClearance {
  const pairs = pairReads(sessions, recovery, { ...opts, heatSignals });
  const withSamples = pairs.filter((p) => p.heat === true);
  const withoutSamples = pairs.filter((p) => p.heat === false);
  const withHeat = recoveryIndex(withSamples.map((p) => p.curve));
  const withoutHeat = recoveryIndex(withoutSamples.map((p) => p.curve));
  // Zero confidence on either side means there is no comparison to report —
  // and a delta computed from a neutral placeholder would read as "heat does
  // nothing", which is a claim, not an absence.
  const confidence = Math.min(withHeat.confidence, withoutHeat.confidence);
  return {
    withHeat,
    withoutHeat,
    delta: confidence > 0 ? Math.round((withHeat.index - withoutHeat.index) * 1000) / 1000 : 0,
    confidence,
    withSamples,
    withoutSamples,
  };
}
