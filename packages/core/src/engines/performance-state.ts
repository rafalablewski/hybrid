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
    top[1] >= LIMITER_FATIGUE
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

/**
 * The fatigue at which a tissue stops being background load and becomes the
 * thing holding today back. Shared by the narrative and the verdict so the
 * card's one-line face can never name a limiter the derivation below it
 * doesn't, or stay silent while the derivation names one.
 */
const LIMITER_FATIGUE = 25;

/**
 * THE LINES BEHIND THE DOOR — the derivation without its first line.
 *
 * `readinessWhy`'s line 0 restates the score ("Readiness 67/100."), which the
 * ring beside it already draws at 30px. Behind a disclosure that line is pure
 * duplication, so this is the same array minus it. Derived from `readinessWhy`
 * rather than re-deriving the sentences, so the two can't drift apart.
 */
export function readinessReasons(log: TrainingLog, bio?: Biometrics): string[] {
  return readinessWhy(log, bio).slice(1);
}

/** What shape today's readiness read takes. */
export type ReadinessVerdictKind = "empty" | "clear" | "limiter";

/**
 * The ONE line the readiness block wears on its face, plus what the door
 * beside it may honestly promise.
 */
export interface ReadinessVerdict {
  kind: ReadinessVerdictKind;
  /**
   * i18n key for the line. A KEY, not a sentence — unlike `readinessWhy`,
   * which is English-only prose, this is the one line most athletes will ever
   * read, so it has to speak Polish and German too.
   */
  key: string;
  /** The tissue a `limiter` verdict names — resolve through `w.home.today.muscle.*`. */
  muscle: MuscleGroup | null;
  /**
   * Points below 100. This is ARITHMETIC, not attribution: we can say how much
   * is missing today without yet being able to say what each cause spent (that
   * needs a deficit split out of `computeReadiness`, which doesn't exist yet).
   */
  deficit: number;
  /**
   * How many lines actually sit behind the door. The door labels itself from
   * this, so it can never offer three reasons and open onto two.
   */
  reasons: number;
  /**
   * i18n key for the door's own label. "Where the 33 went" is the honest
   * question while something IS missing; at a clean 100 nothing went anywhere,
   * and the wearable can still have a line worth reading, so the door asks a
   * different question rather than pointing at a zero.
   */
  doorKey: string;
}

/** The three faces, as i18n keys. */
export const READINESS_VERDICT_KEY: Record<ReadinessVerdictKind, string> = {
  empty: "w.home.readiness.verdictEmpty",
  clear: "w.home.readiness.verdictClear",
  limiter: "w.home.readiness.verdictLimiter",
};

/**
 * Today's readiness as ONE line, naming the top cause and nothing else.
 *
 * The block used to open with four sentences of prose — ~38 words restating
 * figures the engine had already computed, with every number buried mid-
 * sentence so none of them held a fixed position from one day to the next.
 * This is what replaces them on the card face; the sentences themselves move
 * behind the door (`readinessReasons`), unedited.
 *
 * Agreement with the derivation is structural, not editorial: the limiter
 * threshold is the same constant, and the reason count is the length of the
 * very array the door opens onto.
 */
export function readinessVerdict(log: TrainingLog, bio?: Biometrics): ReadinessVerdict {
  const fatigue = computeFatigue(log);
  const { score } = computeReadiness(fatigue, bio);
  const deficit = Math.max(0, 100 - score);
  const reasons = readinessReasons(log, bio).length;
  const doorKey = deficit > 0 ? "w.home.readiness.door" : "w.home.readiness.doorClear";
  const base = { muscle: null as MuscleGroup | null, deficit, reasons, doorKey };

  if (log.length === 0) return { ...base, kind: "empty", key: READINESS_VERDICT_KEY.empty };
  const top = (Object.entries(fatigue.muscles) as [MuscleGroup, number][]).reduce((a, b) => (b[1] > a[1] ? b : a));
  return top[1] >= LIMITER_FATIGUE
    ? { ...base, kind: "limiter", key: READINESS_VERDICT_KEY.limiter, muscle: top[0] }
    : { ...base, kind: "clear", key: READINESS_VERDICT_KEY.clear };
}

/**
 * The door's count, pluralized where plurals are hard.
 *
 * English and German need two forms; Polish needs three (1 powód, 2–4 powody,
 * 5+ powodów), and the rule is the engine's to own so the two clients can't
 * pick differently for the same number.
 */
export function readinessReasonsKey(n: number): string {
  if (n === 1) return "w.home.readiness.reasonsOne";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "w.home.readiness.reasonsFew";
  return "w.home.readiness.reasonsMany";
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
