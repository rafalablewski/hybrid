/**
 * Personal model — per-athlete online learning for the injury engine.
 *
 * The population model says spike risk ramps in at ACWR ~1.3 (injury.ts). Real
 * athletes differ: one repeatedly tolerates 1.6 without a scratch, another
 * breaks down at 1.2. This module learns a PERSONAL spike onset from the
 * athlete's own history using the same shrinkage idiom the data network uses
 * for cohort norms (datanet.shrinkNorm): with little evidence the onset stays
 * at the population prior; as labeled exposures accumulate it moves toward
 * what the athlete has actually demonstrated — bounded, so no history can push
 * it into recklessness (max 1.6) or paranoia (min 1.1).
 *
 * Pure math. The server derives AcwrEvents by replaying the athlete's log at
 * each labeled outcome's date (acwrEventsFromHistory), so the evidence comes
 * from the same engine that scores today.
 */

import type { TrainingLog } from "./types";
import { computeInjuryRisk } from "./injury";

/** Population prior and the hard bounds personalization may move within. */
export const SPIKE_ONSET_PRIOR = 1.3;
export const SPIKE_ONSET_MIN = 1.1;
export const SPIKE_ONSET_MAX = 1.6;

/** Pseudo-observations the prior is worth (same convention as shrinkNorm). */
export const SPIKE_ONSET_PRIOR_WEIGHT = 8;

/** One labeled exposure: the athlete's peak tissue ACWR at that time + outcome. */
export interface AcwrEvent {
  /** highest per-tissue ACWR in effect at the time of the observation */
  acwr: number;
  /** whether an injury was recorded for that observation */
  injured: boolean;
}

export interface Personalization {
  /** the personal ACWR at which spike risk starts ramping (default 1.3) */
  spikeOnset: number;
  /** spikes above the prior tolerated without injury (evidence to raise) */
  toleratedSpikes: number;
  /** injury outcomes in the evidence set (evidence to lower) */
  injuries: number;
  /** informative events used (uninformative ones carry no signal) */
  n: number;
  /** true when the onset has actually moved off the prior */
  personalized: boolean;
}

const clampOnset = (x: number) =>
  Math.max(SPIKE_ONSET_MIN, Math.min(SPIKE_ONSET_MAX, x));

/**
 * Learn the personal spike onset. Each informative event proposes a target:
 *   • a spike above the prior tolerated WITHOUT injury → "I handled a" (raise
 *     toward a, capped at the max);
 *   • an injury → onset should sit below the ACWR it happened at (lower toward
 *     acwr − 0.1, floored) — an injury at low ACWR is strong evidence for a
 *     fragile athlete.
 * Non-spike, non-injury events carry no information and are ignored. The
 * onset is the evidence mean shrunk toward the prior by `priorWeight`.
 */
export function derivePersonalization(
  events: AcwrEvent[],
  priorWeight = SPIKE_ONSET_PRIOR_WEIGHT,
): Personalization {
  const targets: number[] = [];
  let tolerated = 0;
  let injuries = 0;
  for (const e of events) {
    if (!Number.isFinite(e.acwr)) continue;
    if (e.injured) {
      injuries++;
      targets.push(clampOnset(Math.min(e.acwr, SPIKE_ONSET_PRIOR) - 0.1));
    } else if (e.acwr > SPIKE_ONSET_PRIOR) {
      tolerated++;
      targets.push(clampOnset(e.acwr));
    }
  }
  const n = targets.length;
  const mean = n ? targets.reduce((a, b) => a + b, 0) / n : SPIKE_ONSET_PRIOR;
  const onset = clampOnset(
    (n * mean + priorWeight * SPIKE_ONSET_PRIOR) / (n + priorWeight),
  );
  const rounded = Math.round(onset * 100) / 100;
  return {
    spikeOnset: rounded,
    toleratedSpikes: tolerated,
    injuries,
    n,
    personalized: rounded !== SPIKE_ONSET_PRIOR,
  };
}

/** Peak per-tissue ACWR with the log rebased to `daysAgo` (0 = today). */
export function maxAcwrAt(log: TrainingLog, daysAgo: number): number {
  const subLog = log
    .filter((s) => s.daysAgo >= daysAgo)
    .map((s) => ({ ...s, daysAgo: s.daysAgo - daysAgo }));
  const risk = computeInjuryRisk(subLog);
  let max = 0;
  for (const t of risk.tissues) if (t.enoughHistory && t.acwr > max) max = t.acwr;
  return max;
}

/**
 * Build the evidence set from labeled outcomes (e.g. RiskOutcome rows): each
 * outcome is paired with the peak ACWR the athlete was carrying at that time,
 * replayed from their own training log. Outcomes with no computable ACWR
 * (no chronic history at that date) are dropped — no signal, no evidence.
 */
export function acwrEventsFromHistory(
  log: TrainingLog,
  outcomes: { daysAgo: number; injured: boolean }[],
): AcwrEvent[] {
  const events: AcwrEvent[] = [];
  for (const o of outcomes) {
    if (!Number.isFinite(o.daysAgo) || o.daysAgo < 0) continue;
    const acwr = maxAcwrAt(log, Math.round(o.daysAgo));
    if (acwr > 0) events.push({ acwr, injured: o.injured });
  }
  return events;
}
