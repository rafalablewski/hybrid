import type { MuscleGroup } from "./types";
import type { LoggedSession } from "./session";
import { e1rm, setsForVolume } from "./session";
import { musclesFor, ALL_MUSCLES } from "./movements";
import { VOLUME_LANDMARKS, weeklySetsByMuscle, type VolumeLandmark } from "./landmarks";
import { sorenessFromCheckin } from "../checkin-scales";
import { feelReading, hoursAfterSession, COST_HIGH, MIN_STRAIN_FATIGUE } from "../feel-timing";

/**
 * ADAPTIVE RECOVERABLE VOLUME — the estimate that corrects the prior.
 *
 * `landmark-profile.ts` produces a PRIOR from what the athlete tells us (training
 * age, mass, sleep, …). This module corrects that prior from what actually
 * happened, which is the only real evidence of anyone's MRV: you find a ceiling
 * by running into it.
 *
 * The reasoning per muscle, per week:
 *
 *   TOLERATED — high sets, performance held or rose, post-session fatigue and
 *     check-in soreness stayed moderate, energy did not collapse. That week is
 *     a lower bound: the ceiling is at least that high, so if it sat at/above
 *     the current estimate, raise it.
 *
 *   OVERREACHED — performance fell week-on-week, or fatigue/soreness spiked, or
 *     reported energy bottomed out. That week is an upper bound: the ceiling is
 *     below that set count, so pull the estimate under it.
 *
 * The subjective measures come from the DAILY CHECK-IN, on the check-in's own
 * 1–5 scales, averaged over the days inside each window. They are the cheapest
 * honest signal available: an athlete knows they are buried a week before their
 * top set does.
 *
 * Everything else is ignored. A week with too few sets tells you nothing about
 * a ceiling, and neither does a week with nothing to compare it to. The
 * estimate moves slowly, is bounded to ±35% of the prior, and carries the
 * evidence that moved it, because "your MRV is 16" without "because week of
 * the 3rd you did 18 and your top sets fell 5%" is not actionable.
 *
 * Deliberately conservative: with fewer than two qualifying weeks it returns
 * the prior unchanged and reports zero confidence.
 */

const WEEK_MS = 7 * 86_400_000;

/** One week of evidence for one muscle. */
export interface VolumeWeekObservation {
  /** 0 = the current 7-day window, 1 = the one before it, … */
  weeksAgo: number;
  /** Working sets counted toward this muscle that week. */
  sets: number;
  /** Best e1RM across that muscle's movements, or null if nothing comparable. */
  performance: number | null;
  /** Mean post-session fatigue (1–5) across sessions that trained it, or null.
   *  The raw taps, for display. */
  fatigue: number | null;
  /**
   * Mean TIMING-ADJUSTED fatigue cost across those sessions, or null when no
   * session carried a feel timestamp. This is the number the strain rules use
   * where it exists, because a raw 4 means different things at 1 h and 10 h
   * after training — see feel-timing.ts.
   */
  fatigueCost: number | null;
  /** Soreness (1–5, 5 = VERY SORE) for that week, if checked in. Converted from
   *  the check-in's freshness sense on the way in — see checkin-scales.ts. */
  soreness: number | null;
  /** Self-reported energy (1–5, 5 = high) for that week, if checked in. */
  energy: number | null;
  /**
   * THE recovery reading for the week: every "how spent are you" report —
   * from the check-in now, from a session's post-workout answer on historical
   * rows — put on one scale, placed in time, and averaged by weight. This is
   * what the strain rules read. One question, one number, one threshold.
   */
  recoveryCost: number | null;
}

/**
 * A daily check-in as this engine reads it. Every measure is optional because
 * athletes skip fields; the engine uses whatever is there. Scales match the
 * check-in exactly (1–5), so nothing is being reinterpreted on the way in.
 */
export interface RecoveryReport {
  /** ISO date the report covers. */
  date: string;
  /**
   * The check-in's `soreness` column AS STORED, which is FRESHNESS: 5 = muscles
   * feel fresh, 1 = wrecked. Named for the column so callers can hand the row
   * straight over; converted to real soreness inside. See checkin-scales.ts —
   * reading this field by its name is how the estimator shipped inverted.
   */
  soreness?: number | null;
  /** 5 = slept great. */
  sleep?: number | null;
  /** 5 = high energy. */
  energy?: number | null;
  /** 5 = good mood. */
  mood?: number | null;
  /**
   * WHEN the check-in was written (Checkin.createdAt). The lag from the last
   * session that finished before it is what makes this reading comparable to
   * any other: "wrecked" ninety minutes after squats and "wrecked" the next
   * morning are not the same measurement. Null falls back to the raw reading —
   * never a guessed lag. See feel-timing.ts.
   */
  loggedAt?: string | null;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const numOf = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/** One session's post-workout fatigue report, placed in time. */
interface FatigueSample {
  /** The raw 1–5 tap. */
  raw: number;
  /** Timing-adjusted cost (feel-timing.ts). Equals the raw fraction when the
   *  lag is unknown, so an untimed row is never inflated. */
  cost: number;
  /** How much the report counts — long lags are recall, not measurement. */
  weight: number;
  /** Whether a lag was actually known for this report. */
  timed: boolean;
}

/** Weighted mean of the raw taps — what the athlete literally reported. */
function meanFatigue(xs: FatigueSample[] | undefined): number | null {
  if (!xs?.length) return null;
  const w = xs.reduce((n, x) => n + x.weight, 0);
  if (!(w > 0)) return null;
  return Math.round((xs.reduce((n, x) => n + x.raw * x.weight, 0) / w) * 100) / 100;
}

/** Weighted mean cost — null unless at least one report carried a timestamp,
 *  because a cost built only from untimed rows says nothing the raw mean
 *  doesn't already say, and pretending otherwise would double-count it. */
function meanCost(xs: FatigueSample[] | undefined): number | null {
  if (!xs?.length || !xs.some((x) => x.timed)) return null;
  const w = xs.reduce((n, x) => n + x.weight, 0);
  if (!(w > 0)) return null;
  return Math.round((xs.reduce((n, x) => n + x.cost * x.weight, 0) / w) * 1000) / 1000;
}

/**
 * Bucket the log into 7-day windows and, for each muscle, record the sets, the
 * best e1RM and the mean post-session fatigue for each window. `weeks` windows
 * are returned (most recent first), including empty ones so gaps are visible.
 */
export function observeVolumeResponse(
  sessions: LoggedSession[],
  opts: {
    now?: number;
    weeks?: number;
    includeWarmups?: boolean;
    fractional?: boolean;
    recovery?: RecoveryReport[];
  } = {},
): Map<MuscleGroup, VolumeWeekObservation[]> {
  const now = opts.now ?? Date.now();
  const weeks = clamp(Math.round(opts.weeks ?? 8), 2, 26);

  // Per muscle, per window: the best e1RM seen and the fatigue reports. A
  // report is kept as {raw, cost, weight} rather than a bare number, so the
  // window mean can respect BOTH how long after the session it was given and
  // how much a report at that lag deserves to count.
  const best = new Map<MuscleGroup, Map<number, number>>();
  const fatigue = new Map<MuscleGroup, Map<number, FatigueSample[]>>();

  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    if (!Number.isFinite(t) || t > now) continue;
    const w = Math.floor((now - t) / WEEK_MS);
    if (w >= weeks) continue;
    // The lag is measured from the END of the session where we know it.
    const lag = hoursAfterSession(s.completedAt ?? s.startedAt, s.feelLoggedAt);
    const reading = typeof s.fatigue === "number" ? feelReading(s.fatigue, lag) : null;
    const sessionFatigue: FatigueSample | null = reading
      ? { raw: reading.fatigue, cost: reading.cost, weight: reading.weight, timed: reading.hoursAfter != null }
      : null;

    for (const b of s.blocks) {
      if (b.kind !== "strength") continue;
      const muscles = musclesFor(b.name);
      if (muscles.length === 0) continue;

      let top = 0;
      for (const set of setsForVolume(b, opts.includeWarmups)) {
        const load = numOf(set.load);
        const reps = numOf(set.reps);
        if (!(load > 0) || !(reps > 0)) continue;
        top = Math.max(top, e1rm(load, reps));
      }

      for (const m of muscles) {
        if (top > 0) {
          const byWeek = best.get(m) ?? new Map<number, number>();
          byWeek.set(w, Math.max(byWeek.get(w) ?? 0, top));
          best.set(m, byWeek);
        }
        if (sessionFatigue !== null) {
          const byWeek = fatigue.get(m) ?? new Map<number, FatigueSample[]>();
          const arr = byWeek.get(w) ?? [];
          arr.push(sessionFatigue);
          byWeek.set(w, arr);
          fatigue.set(m, byWeek);
        }
      }
    }
  }

  // Session end times, so a check-in can be placed relative to the training it
  // is reporting on. Sorted once; each report binary-walks back to the most
  // recent session that finished BEFORE it was written.
  const ends = sessions
    .map((s) => Date.parse(s.completedAt ?? s.startedAt ?? ""))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const lastEndBefore = (t: number): number | null => {
    let lo = 0, hi = ends.length - 1, best: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ends[mid]! <= t) { best = ends[mid]!; lo = mid + 1; } else { hi = mid - 1; }
    }
    return best;
  };

  // Check-in reports apply to every muscle — they are whole-athlete measures.
  // Soreness and energy both answer "how spent are you"; they are put on ONE
  // spentness scale (5 = wrecked), placed in time against the last session, and
  // pooled with the session-side reports so a single threshold reads them all.
  const sorenessByWeek = new Map<number, number[]>();
  const energyByWeek = new Map<number, number[]>();
  const recoveryByWeek = new Map<number, FatigueSample[]>();
  const scale = (v: number | null | undefined): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5 ? v : null;
  for (const r of opts.recovery ?? []) {
    const t = new Date(r.date).getTime();
    if (!Number.isFinite(t) || t > now) continue;
    const w = Math.floor((now - t) / WEEK_MS);
    if (w >= weeks) continue;
    // The column stores freshness; the model wants soreness. Convert HERE, once.
    const sore = sorenessFromCheckin(r.soreness);
    if (sore !== null) sorenessByWeek.set(w, [...(sorenessByWeek.get(w) ?? []), sore]);
    const energy = scale(r.energy);
    if (energy !== null) energyByWeek.set(w, [...(energyByWeek.get(w) ?? []), energy]);

    // Both measures point the same way once inverted: high = spent.
    const spentParts: number[] = [];
    if (sore !== null) spentParts.push(sore);
    if (energy !== null) spentParts.push(6 - energy);
    if (!spentParts.length) continue;
    const spent = spentParts.reduce((a, b) => a + b, 0) / spentParts.length;

    const writtenAt = r.loggedAt ? Date.parse(r.loggedAt) : t;
    const prevEnd = Number.isFinite(writtenAt) ? lastEndBefore(writtenAt) : null;
    const lag = prevEnd == null ? null : hoursAfterSession(prevEnd, writtenAt);
    const reading = feelReading(spent, lag);
    if (!reading) continue;
    recoveryByWeek.set(w, [
      ...(recoveryByWeek.get(w) ?? []),
      { raw: reading.fatigue, cost: reading.cost, weight: reading.weight, timed: reading.hoursAfter != null },
    ]);
  }

  const mean = (xs: number[] | undefined): number | null =>
    xs && xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;

  // One 7-day window per `weeksAgo`, counted by the same engine the Volume
  // screen uses so the two views can never disagree. Counted once per window
  // rather than once per muscle-window.
  const countsByWeek: Map<MuscleGroup, number>[] = Array.from({ length: weeks }, (_, w) =>
    weeklySetsByMuscle(sessions, {
      now: now - w * WEEK_MS,
      days: 7,
      includeWarmups: opts.includeWarmups,
      fractional: opts.fractional,
    }),
  );

  const out = new Map<MuscleGroup, VolumeWeekObservation[]>();
  for (const m of ALL_MUSCLES) {
    const rows: VolumeWeekObservation[] = [];
    for (let w = 0; w < weeks; w++) {
      rows.push({
        weeksAgo: w,
        sets: countsByWeek[w]!.get(m) ?? 0,
        performance: best.get(m)?.get(w) ?? null,
        fatigue: meanFatigue(fatigue.get(m)?.get(w)),
        fatigueCost: meanCost(fatigue.get(m)?.get(w)),
        soreness: mean(sorenessByWeek.get(w)),
        energy: mean(energyByWeek.get(w)),
        // The check-in reports for the week pooled with this muscle's own
        // session-side reports — one number, one threshold.
        recoveryCost: meanCost([...(recoveryByWeek.get(w) ?? []), ...(fatigue.get(m)?.get(w) ?? [])]),
      });
    }
    out.set(m, rows);
  }
  return out;
}

/** Why the estimate landed where it did. */
export interface MrvEvidence {
  weeksAgo: number;
  sets: number;
  verdict: "tolerated" | "overreached";
  /** Week-on-week performance change as a fraction, e.g. −0.04, or null. */
  performanceDelta: number | null;
  fatigue: number | null;
  /** The timing-adjusted cost behind the verdict, when the week had one. */
  fatigueCost: number | null;
  /** The pooled recovery cost the verdict actually read. */
  recoveryCost: number | null;
  soreness: number | null;
  energy: number | null;
}

export interface MrvEstimate {
  /** The estimated ceiling in weekly sets. Equals the prior when unproven. */
  mrv: number;
  /** The prior it started from. */
  prior: number;
  /** 0…1 — how much evidence backs the estimate. 0 = the prior, untouched. */
  confidence: number;
  /** The weeks that moved it, most recent first. */
  evidence: MrvEvidence[];
}

/** Performance is "down" past this fraction; "held" at or above the negative of
 *  the tolerated band. Day-to-day e1RM noise on a top set is a couple of
 *  percent, so the bands sit outside that. */
const PERF_DROP = -0.03;
const PERF_HELD = -0.015;
/**
 * Post-session fatigue thresholds. TWO rules, because a fatigue report is only
 * comparable across sessions once you know how long after training it was
 * given: where the week carries a timing-adjusted cost, that is what decides;
 * where it doesn't (rows written before feel timestamps existed), the raw 1–5
 * rule is kept exactly as it was rather than silently loosening. `COST_HIGH`
 * lives in feel-timing.ts next to the model it was calibrated against.
 */
const FATIGUE_HIGH = 4.2;
const FATIGUE_OK = 3.5;
/** Cost below which a week reads as absorbed. A hard session logged in the gym
 *  (fatigue 4 at ~1 h ≈ 0.83) clears it; the same 4 ten hours later does not. */
export const COST_OK = 0.9;
/** Soreness (5 = very sore, already converted from the check-in's freshness). */
const SORENESS_HIGH = 4.2;
/** Reported energy (1–5) that low says the week was not absorbed, whatever the
 *  bar said; a week only reads as tolerated at or above ENERGY_OK. */
const ENERGY_LOW = 1.8;
const ENERGY_OK = 2.5;

/**
 * Estimate one muscle's recoverable ceiling from its weekly observations.
 *
 * A week qualifies as evidence only if it carried real volume (at least the top
 * of the productive band) and has a previous week to compare against. The
 * estimate is bounded to ±35% of the prior — no four-week window should be able
 * to double or halve an athlete's ceiling.
 */
export function estimateMrv(observations: VolumeWeekObservation[], landmark: VolumeLandmark): MrvEstimate {
  const prior = landmark.mrv;
  const evidence: MrvEvidence[] = [];
  const byWeek = [...observations].sort((a, b) => a.weeksAgo - b.weeksAgo);

  for (const o of byWeek) {
    // Not enough volume to say anything about a ceiling.
    if (o.sets < landmark.mavHigh) continue;
    const prev = byWeek.find((x) => x.weeksAgo === o.weeksAgo + 1);
    const delta =
      o.performance !== null && prev?.performance != null && prev.performance > 0
        ? Math.round(((o.performance - prev.performance) / prev.performance) * 1000) / 1000
        : null;

    // ONE recovery reading, ONE threshold. Every "how spent are you" answer —
    // the check-in's freshness and energy now, a session's post-workout answer
    // on historical rows — is already pooled into `recoveryCost` on the same
    // scale, lag-adjusted and weighted. Where a week has that, it decides.
    //
    // Only where it doesn't (rows predating the timestamps) do the old raw 1–5
    // rules apply, unchanged rather than silently loosened. The two are never
    // mixed: the cost already contains the raw values, so consulting both would
    // count the same report twice.
    const cost = o.recoveryCost ?? o.fatigueCost;
    const rawSpent = Math.max(
      o.fatigue ?? 0,
      o.soreness ?? 0,
      o.energy != null ? 6 - o.energy : 0,
    ) || null;

    const recoveryStrained = cost != null
      ? cost >= COST_HIGH && (rawSpent == null || rawSpent >= MIN_STRAIN_FATIGUE)
      : (o.fatigue != null && o.fatigue >= FATIGUE_HIGH) ||
        (o.soreness != null && o.soreness >= SORENESS_HIGH) ||
        (o.energy != null && o.energy <= ENERGY_LOW);
    const recoveryOk = cost != null
      ? cost < COST_OK
      : (o.fatigue == null || o.fatigue <= FATIGUE_OK) &&
        (o.soreness == null || o.soreness <= SORENESS_HIGH) &&
        (o.energy == null || o.energy >= ENERGY_OK);

    // `!= null` throughout: an observation may arrive from JSON with a field
    // simply absent, and a missing measure must read as "unknown", not as a
    // number that fails every comparison and silently disqualifies the week.
    const strained = (delta != null && delta < PERF_DROP) || recoveryStrained;
    const held = delta != null && delta >= PERF_HELD && recoveryOk;

    const row = { weeksAgo: o.weeksAgo, sets: o.sets, performanceDelta: delta, fatigue: o.fatigue, fatigueCost: o.fatigueCost, recoveryCost: cost, soreness: o.soreness, energy: o.energy };
    if (strained) evidence.push({ ...row, verdict: "overreached" });
    else if (held) evidence.push({ ...row, verdict: "tolerated" });
  }

  if (evidence.length < 2) return { mrv: prior, prior, confidence: 0, evidence };

  // The floor is anchored to MEV, not to the prior's MAV band: when the ceiling
  // comes down the band comes down with it (see `adaptLandmarks`), so anchoring
  // to the old band would leave no room to adapt downwards at all.
  const floor = Math.max(landmark.mev + 2, Math.round(prior * 0.65));
  const ceiling = Math.round(prior * 1.35);

  const overreached = evidence.filter((e) => e.verdict === "overreached").map((e) => e.sets);
  const tolerated = evidence.filter((e) => e.verdict === "tolerated").map((e) => e.sets);

  let mrv = prior;
  if (overreached.length) {
    // The lowest set count that produced symptoms is an upper bound: the
    // ceiling is under it. Symptoms always beat "I got away with it".
    mrv = Math.min(prior, Math.min(...overreached) - 1);
  } else if (tolerated.length) {
    const highest = Math.max(...tolerated);
    // Only RAISE when the athlete has actually worked at or near the current
    // ceiling — clearing 12 sets says nothing about a ceiling of 20.
    if (highest >= prior - 1) mrv = highest + 1;
  }
  mrv = clamp(Math.round(mrv), floor, ceiling);

  // Four qualifying weeks is as certain as this ever gets; agreeing weeks are
  // worth more than a lone outlier, so confidence tracks the count.
  const confidence = Math.round(clamp(evidence.length / 4, 0, 1) * 100) / 100;
  return { mrv, prior, confidence, evidence: evidence.sort((a, b) => a.weeksAgo - b.weeksAgo) };
}

export interface AdaptedLandmarks {
  landmarks: Record<MuscleGroup, VolumeLandmark>;
  estimates: Record<MuscleGroup, MrvEstimate>;
  /** Muscles whose ceiling actually moved off the prior. */
  adapted: MuscleGroup[];
  /** Mean confidence across muscles with evidence, 0 when there is none. */
  confidence: number;
}

/**
 * Correct a full landmark map from the training log. MEV is left alone — the
 * log can prove a ceiling (you ran into it) but not a floor, since nobody
 * trains just below their MEV on purpose to find it. When MRV moves, the MAV
 * band is re-derived at the same proportional position between MEV and the new
 * ceiling, so the corridor stays coherent.
 */
export function adaptLandmarks(
  sessions: LoggedSession[],
  opts: {
    landmarks?: Record<MuscleGroup, VolumeLandmark>;
    now?: number;
    weeks?: number;
    includeWarmups?: boolean;
    fractional?: boolean;
    recovery?: RecoveryReport[];
  } = {},
): AdaptedLandmarks {
  const base = opts.landmarks ?? VOLUME_LANDMARKS;
  const obs = observeVolumeResponse(sessions, opts);
  const landmarks = {} as Record<MuscleGroup, VolumeLandmark>;
  const estimates = {} as Record<MuscleGroup, MrvEstimate>;
  const adapted: MuscleGroup[] = [];
  let confSum = 0;
  let confN = 0;

  for (const m of ALL_MUSCLES) {
    const l = base[m];
    const est = estimateMrv(obs.get(m) ?? [], l);
    estimates[m] = est;
    if (est.confidence > 0) {
      confSum += est.confidence;
      confN++;
    }
    if (est.mrv === l.mrv) {
      landmarks[m] = l;
      continue;
    }
    adapted.push(m);
    const span = l.mrv - l.mev;
    const pLow = span > 0 ? (l.mavLow - l.mev) / span : 0.33;
    const pHigh = span > 0 ? (l.mavHigh - l.mev) / span : 0.75;
    const newSpan = est.mrv - l.mev;
    const mavLow = Math.max(l.mev, Math.round(l.mev + newSpan * pLow));
    const mavHigh = Math.max(mavLow, Math.min(est.mrv, Math.round(l.mev + newSpan * pHigh)));
    landmarks[m] = { ...l, mavLow, mavHigh, mrv: est.mrv };
  }

  return {
    landmarks,
    estimates,
    adapted,
    confidence: confN ? Math.round((confSum / confN) * 100) / 100 : 0,
  };
}
