/**
 * Performance State — the athlete's fused current state.
 *
 * One call materializes the athlete's current state from their training log and
 * recovery signals: HPI, readiness, fatigue, AND the attribution — the ranked
 * "why did it move" drivers a coach actually wants. This is the object the
 * cockpit opens to. Pure; composes the existing engines.
 */

import type { Biometrics, Fatigue, MuscleGroup, Readiness, TrainingLog } from "./types";
import { computeFatigue } from "./fatigue";
import { computeReadiness } from "./readiness";
import { computeHpi, enduranceFatigue, HYBRID_WEIGHTS, type Hpi, type HpiWeights } from "./hpi";

/** One contributing factor to the current state, ranked by magnitude. */
export interface StateDriver {
  /** short label, e.g. "Quads fatigue" or "HRV" */
  factor: string;
  /** does it help (positive) or hurt (negative) readiness to perform */
  impact: "positive" | "negative";
  /** relative magnitude 0..1 — drives ranking */
  weight: number;
  /** human-readable explanation */
  detail: string;
}

export interface PerformanceState {
  hpi: Hpi;
  readiness: Readiness;
  fatigue: Fatigue;
  /** ranked, biggest mover first */
  drivers: StateDriver[];
  /** one-line natural-language read of the state */
  summary: string;
}

const NICE: Record<MuscleGroup, string> = {
  quads: "Quads",
  glutes: "Glutes",
  posterior: "Posterior chain",
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  triceps: "Triceps",
};

/** Recovery drivers from how today's wearable readings sit vs. baseline. */
function recoveryDrivers(bio: Biometrics): StateDriver[] {
  const out: StateDriver[] = [];
  const consider = (
    label: string,
    m: { today: number; baseline: number; better: "high" | "low" },
  ) => {
    if (!m.baseline) return;
    const dev = (m.today - m.baseline) / m.baseline;
    const oriented = m.better === "high" ? dev : -dev;
    if (Math.abs(oriented) < 0.04) return; // ignore noise
    const dir = oriented > 0 ? "above" : "below";
    out.push({
      factor: label,
      impact: oriented > 0 ? "positive" : "negative",
      weight: Math.min(1, Math.abs(oriented) * 3),
      detail: `${label} ${Math.round(Math.abs(dev) * 100)}% ${dir} your baseline`,
    });
  };
  consider("HRV", bio.hrv);
  consider("Resting HR", bio.restingHr);
  consider("Sleep", bio.sleep);
  return out;
}

/**
 * Compute the full Performance State. `bio` is optional (drivers fall back to
 * load only). `weights` lets the HPI mean the right thing for the athlete.
 */
export function computePerformanceState(
  log: TrainingLog,
  bio?: Biometrics,
  weights: HpiWeights = HYBRID_WEIGHTS,
): PerformanceState {
  const fatigue = computeFatigue(log);
  const readiness = computeReadiness(fatigue, bio);
  const hpi = computeHpi(fatigue, bio, weights);

  const drivers: StateDriver[] = [];

  // most-loaded muscle (the strength limiter)
  const muscleEntries = Object.entries(fatigue.muscles) as [MuscleGroup, number][];
  const topMuscle = muscleEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (topMuscle[1] >= 25) {
    drivers.push({
      factor: `${NICE[topMuscle[0]]} fatigue`,
      impact: "negative",
      weight: topMuscle[1] / 100,
      detail: `${topMuscle[1]}/100 — your most-loaded tissue`,
    });
  }

  // conditioning load (the endurance limiter)
  const endFat = enduranceFatigue(fatigue);
  if (endFat >= 30) {
    drivers.push({
      factor: "Conditioning load",
      impact: "negative",
      weight: endFat / 100,
      detail: `energy-system load at ${endFat}/100`,
    });
  }

  if (bio) drivers.push(...recoveryDrivers(bio));

  drivers.sort((a, b) => b.weight - a.weight);

  const top = drivers[0];
  const lim = hpi.limiter;
  const summary =
    `HPI ${hpi.score} (${hpi.band}). ` +
    `Limiter: ${lim}` +
    (top ? ` — ${top.detail.toLowerCase()}.` : ".");

  return { hpi, readiness, fatigue, drivers: drivers.slice(0, 4), summary };
}

export interface TrajectoryPoint {
  /** days before today (0 = today) */
  daysAgo: number;
  hpi: number;
  readiness: number;
}

/**
 * Replay HPI + readiness over the last `days` by re-basing the log to each past
 * day — so a coach sees the trend, not just today's snapshot. Load-driven
 * (biometrics aren't replayed historically); returns oldest → newest.
 */
export function performanceTrajectory(log: TrainingLog, days = 14): TrajectoryPoint[] {
  const out: TrajectoryPoint[] = [];
  for (let n = days - 1; n >= 0; n--) {
    const subLog = log
      .filter((s) => s.daysAgo >= n)
      .map((s) => ({ ...s, daysAgo: s.daysAgo - n }));
    const fatigue = computeFatigue(subLog);
    out.push({
      daysAgo: n,
      hpi: computeHpi(fatigue).score,
      readiness: computeReadiness(fatigue).score,
    });
  }
  return out;
}
