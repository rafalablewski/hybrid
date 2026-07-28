import type { MuscleGroup } from "./types";
import type { LoggedSession } from "./session";
import { e1rm, setsForVolume } from "./session";
import { musclesFor, ALL_MUSCLES } from "./movements";
import { VOLUME_LANDMARKS, weeklySetsByMuscle, type VolumeLandmark } from "./landmarks";

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
  /** Mean post-session fatigue (1–5) across sessions that trained it, or null. */
  fatigue: number | null;
  /** Self-reported soreness (1–5, 5 = very sore) for that week, if checked in. */
  soreness: number | null;
  /** Self-reported energy (1–5, 5 = high) for that week, if checked in. */
  energy: number | null;
}

/**
 * A daily check-in as this engine reads it. Every measure is optional because
 * athletes skip fields; the engine uses whatever is there. Scales match the
 * check-in exactly (1–5), so nothing is being reinterpreted on the way in.
 */
export interface RecoveryReport {
  /** ISO date the report covers. */
  date: string;
  /** 5 = very sore. */
  soreness?: number | null;
  /** 5 = slept great. */
  sleep?: number | null;
  /** 5 = high energy. */
  energy?: number | null;
  /** 5 = good mood. */
  mood?: number | null;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const numOf = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

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

  // Per muscle, per window: the best e1RM seen and the fatigue reports.
  const best = new Map<MuscleGroup, Map<number, number>>();
  const fatigue = new Map<MuscleGroup, Map<number, number[]>>();

  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    if (!Number.isFinite(t) || t > now) continue;
    const w = Math.floor((now - t) / WEEK_MS);
    if (w >= weeks) continue;
    const sessionFatigue = typeof s.fatigue === "number" && s.fatigue >= 1 && s.fatigue <= 5 ? s.fatigue : null;

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
          const byWeek = fatigue.get(m) ?? new Map<number, number[]>();
          const arr = byWeek.get(w) ?? [];
          arr.push(sessionFatigue);
          byWeek.set(w, arr);
          fatigue.set(m, byWeek);
        }
      }
    }
  }

  // Check-in reports apply to every muscle — they are whole-athlete measures,
  // averaged over the days that fall in each window.
  const sorenessByWeek = new Map<number, number[]>();
  const energyByWeek = new Map<number, number[]>();
  const scale = (v: number | null | undefined): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5 ? v : null;
  for (const r of opts.recovery ?? []) {
    const t = new Date(r.date).getTime();
    if (!Number.isFinite(t) || t > now) continue;
    const w = Math.floor((now - t) / WEEK_MS);
    if (w >= weeks) continue;
    const sore = scale(r.soreness);
    if (sore !== null) sorenessByWeek.set(w, [...(sorenessByWeek.get(w) ?? []), sore]);
    const energy = scale(r.energy);
    if (energy !== null) energyByWeek.set(w, [...(energyByWeek.get(w) ?? []), energy]);
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
        fatigue: mean(fatigue.get(m)?.get(w)),
        soreness: mean(sorenessByWeek.get(w)),
        energy: mean(energyByWeek.get(w)),
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
/** Post-session fatigue / soreness (1–5) above which a week reads as overreach. */
const FATIGUE_HIGH = 4.2;
const SORENESS_HIGH = 4.2;
/** …and below which it reads as tolerated. */
const FATIGUE_OK = 3.5;
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

    // `!= null` throughout: an observation may arrive from JSON with a field
    // simply absent, and a missing measure must read as "unknown", not as a
    // number that fails every comparison and silently disqualifies the week.
    const strained =
      (delta != null && delta < PERF_DROP) ||
      (o.fatigue != null && o.fatigue >= FATIGUE_HIGH) ||
      (o.soreness != null && o.soreness >= SORENESS_HIGH) ||
      (o.energy != null && o.energy <= ENERGY_LOW);
    const held =
      delta != null &&
      delta >= PERF_HELD &&
      (o.fatigue == null || o.fatigue <= FATIGUE_OK) &&
      (o.soreness == null || o.soreness <= SORENESS_HIGH) &&
      (o.energy == null || o.energy >= ENERGY_OK);

    const row = { weeksAgo: o.weeksAgo, sets: o.sets, performanceDelta: delta, fatigue: o.fatigue, soreness: o.soreness, energy: o.energy };
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
