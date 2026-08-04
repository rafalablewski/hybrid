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

/**
 * A truthful, history-grounded explanation of TODAY's readiness for the
 * Performance page. Every clause is computed from the athlete's real log (and
 * wearable baseline when present) — no unlogged lifts, no hypothetical
 * session; with an empty log it says so honestly instead of inventing one.
 * (The session-pick narrative — "I prescribed 4×5 @ …" — belongs to
 * prescribeSession.why on the Today flow, not here.)
 *
 * Returned as LINES so the UI renders a scannable stack, not a wall of text.
 */
export function readinessWhy(log: TrainingLog, bio?: Biometrics): string[] {
  const fatigue = computeFatigue(log);
  const { score, bioAdj } = computeReadiness(fatigue, bio);
  const lines: string[] = [`Readiness ${score}/100.`];
  if (log.length === 0) {
    lines.push("Nothing logged yet, so this is a resting baseline — log training and this read will come from your own sessions.");
    return lines;
  }
  const top = (Object.entries(fatigue.muscles) as [MuscleGroup, number][]).reduce((a, b) => (b[1] > a[1] ? b : a));
  lines.push(
    top[1] >= 25
      ? `Computed from your logged training: ${NICE[top[0]].toLowerCase()} fatigue (${top[1]}/100) is the main drag today.`
      : "Computed from your logged training: no meaningful residual fatigue — you're cleared to train.",
  );
  const endFat = enduranceFatigue(fatigue);
  if (endFat >= 30) lines.push(`Energy-system load from recent conditioning sits at ${endFat}/100.`);
  if (bio && bioAdj !== 0) {
    lines.push(
      `Your wearable nudged readiness ${bioAdj > 0 ? "+" : ""}${bioAdj} today — ${
        bioAdj > 0 ? "HRV is above baseline and sleep was solid." : "HRV dipped and sleep ran short."
      }`,
    );
  }
  return lines;
}

export interface TrajectoryPoint {
  /** days before today (0 = today) */
  daysAgo: number;
  hpi: number;
  readiness: number;
}

/**
 * Replay HPI + readiness over the last `days` by re-basing the log to each past
 * day — so a coach sees the trend, not just today's snapshot. Returns oldest →
 * newest.
 *
 * WHY `bio` ONLY TOUCHES TODAY. There is no stored history of wearable
 * readings — `Biometrics` carries today's value against a baseline, not a
 * series — so past days genuinely cannot be replayed with the wearable in
 * them, and this series is load-driven for every day but the last.
 *
 * Today is different, and it is not a modelling choice: the card that draws
 * this series ALSO prints today's HPI and readiness as figures, computed WITH
 * the wearable. Leaving the last point load-only put two different numbers for
 * the same day inside one card — a sparkline whose final bar contradicted the
 * 46pt figure beside it. Passing `bio` here makes the last point the number the
 * athlete is reading. Callers that want the pure load-driven series (the admin
 * Engine Room, which compares scenarios) simply omit it.
 */
export function performanceTrajectory(log: TrainingLog, days = 14, bio?: Biometrics): TrajectoryPoint[] {
  const out: TrajectoryPoint[] = [];
  for (let n = days - 1; n >= 0; n--) {
    const subLog = log
      .filter((s) => s.daysAgo >= n)
      .map((s) => ({ ...s, daysAgo: s.daysAgo - n }));
    const fatigue = computeFatigue(subLog);
    const today = n === 0 ? bio : undefined;
    out.push({
      daysAgo: n,
      hpi: computeHpi(fatigue, today).score,
      readiness: computeReadiness(fatigue, today).score,
    });
  }
  return out;
}

/**
 * THE PAGE'S ONE-LINE VERDICT — the sentence the Performance masthead leads
 * with, in place of a subtitle that described the page rather than the athlete.
 *
 * It is deliberately the two things the page's first two cards would each say
 * alone: how fresh you are, and whether any tissue is on the worklist. It says
 * nothing a card below it doesn't also say in full — which is the only licence
 * a summary above the fold ever has.
 *
 * Returns KEYS, not prose: the clients resolve them through i18n, and the
 * tissue clause carries the area so "{tissue}" can be substituted with the
 * localized name (INJURY_AREA_KEY).
 */
export interface StateVerdict {
  /** i18n key — the freshness clause */
  headKey: string;
  /** i18n key with a "{tissue}" placeholder, or null when nothing is flagged */
  tissueKey: string | null;
  /** the tissue the clause is about, highest risk first */
  tissue: MuscleGroup | null;
}

export function stateVerdict(hpi: Hpi, risk?: { flagged: { tissue: MuscleGroup }[] }): StateVerdict {
  const headKey = `w.home.cockpit.verdict.${hpi.band}`;
  const flagged = risk?.flagged ?? [];
  return {
    headKey,
    tissueKey: flagged.length === 0 ? null : flagged.length === 1 ? "w.home.cockpit.verdict.oneTissue" : "w.home.cockpit.verdict.manyTissues",
    tissue: flagged[0]?.tissue ?? null,
  };
}
