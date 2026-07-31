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
import { readPairCurve } from "../readiness-reads";
import { RECOVERY_WINDOW_H } from "../feel-schedule";

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

export interface PairOptions {
  now?: number;
  /** How far back to look, days. */
  days?: number;
}

/** One matched pair, with enough context to explain itself in the UI. */
export interface RecoveryPair {
  sessionId: string;
  sessionTitle: string;
  /** ISO of the session end the pair is measured from. */
  at: string;
  curve: RecoveryCurve;
}

const endMs = (s: LoggedSession): number => {
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
  sessions: LoggedSession[],
  recovery: RecoveryReport[] = [],
  opts: PairOptions = {},
): RecoveryPair[] {
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
        out.push({ sessionId: s.id, sessionTitle: s.title, at: new Date(end).toISOString(), curve });
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
  sessions: LoggedSession[],
  recovery: RecoveryReport[] = [],
  opts: PairOptions = {},
): RecoveryIndex & { samples: RecoveryPair[] } {
  const samples = pairReads(sessions, recovery, opts);
  return { ...recoveryIndex(samples.map((p) => p.curve)), samples };
}
