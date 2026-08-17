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
import { readinessDeficit } from "./readiness-deficit";

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
  /** The heat prior's points (engines/heat.ts), already suppressed if a fresh
   *  wearable reading exists. Optional + additive: omitted scores as before. */
  heatAdj = 0,
): PerformanceState {
  const fatigue = computeFatigue(log);
  const readiness = computeReadiness(fatigue, bio, heatAdj);
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
  const endFatigue = enduranceFatigue(fatigue);
  lines.push(
    top[1] >= LIMITER_FATIGUE
      ? `Computed from your logged training: ${NICE[top[0]].toLowerCase()} fatigue (${top[1]}/100) is the main drag today.`
      : endFatigue >= CONDITIONING_VOICE
        // "Cleared to train" is a claim about the WHOLE athlete, and this
        // sentence only ever knew about tissue. Beside a conditioning cost of
        // 25 points it read as an all-clear the score was actively refusing.
        ? "Computed from your logged training: no meaningful residual fatigue in any tissue."
        : "Computed from your logged training: no meaningful residual fatigue — you're cleared to train.",
  );
  // The conditioning line appears whenever the load is big enough to have cost
  // a point, not at some higher threshold of its own — it is a real term in the
  // score now (readiness.ts, ENDURANCE_SLOPE), so a day where it took points
  // and said nothing would be the block hiding its own arithmetic.
  if (endFatigue >= CONDITIONING_VOICE) {
    lines.push(`Energy-system load from recent conditioning sits at ${endFatigue}/100, and it counts against today's number.`);
  }
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
 * The energy-system load at which conditioning gets a sentence of its own.
 * Deliberately low, and tied to the arithmetic rather than to taste: at
 * ENDURANCE_SLOPE (0.35) a load of 10 has already cost the athlete points, and
 * a cost the ring draws must be a cost the prose is willing to name.
 */
const CONDITIONING_VOICE = 10;

/** Points below which a cause isn't worth being the card's whole sentence. */
const MEANINGFUL_COST = 3;

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

/** One measured input behind today's number, as an i18n key and its figure. */
export interface ReadinessFact {
  key: string;
  /** the tissue named, for the tissue fact */
  muscle: MuscleGroup | null;
  /** the figure to substitute for `{n}` — signed on the wearable fact */
  value: number;
}

/**
 * THE PROVENANCE LINE — what the ledger can't show.
 *
 * The block used to close with three sentences that restated the ledger's three
 * rows in words ("back fatigue (81/100) is the main drag today"), so the card
 * said everything twice and the second telling was English-only. The rows won;
 * these are the figures they DON'T carry, and only those:
 *
 *   - the limiting tissue's own fatigue. The row says the tissue term cost 30
 *     points; it can't say the tissue reads 81/100, and 81 is the number that
 *     decides whether tomorrow is a deload.
 *   - the energy-system load behind the conditioning row, for the same reason.
 *   - the wearable's signed nudge — which is the one input that can be INVISIBLE
 *     in the ledger: a positive nudge takes no arc and no row (it shrinks every
 *     other share instead), so without this fact a +4 day would show nothing at
 *     all for a wearable that was read and did move the number.
 *   - the heat prior's credit, which is the same case exactly: never negative,
 *     therefore never an arc, therefore invisible without a line of its own.
 *
 * Keys, not prose, so this speaks Polish and German — which the sentences it
 * replaces never did.
 */
export function readinessFacts(log: TrainingLog, bio?: Biometrics, heatAdj = 0): ReadinessFact[] {
  if (log.length === 0) return [];
  const fatigue = computeFatigue(log);
  const { bioAdj, heatAdj: heat } = computeReadiness(fatigue, bio, heatAdj);
  const out: ReadinessFact[] = [];

  const top = (Object.entries(fatigue.muscles) as [MuscleGroup, number][]).reduce((a, b) => (b[1] > a[1] ? b : a));
  if (top[1] > 0) out.push({ key: "w.home.readiness.factTissue", muscle: top[0], value: top[1] });

  const endFatigue = enduranceFatigue(fatigue);
  // The same threshold the prose used, so the line appears on exactly the days
  // the sentence used to — a cost the ring draws is a cost this will name.
  if (endFatigue >= CONDITIONING_VOICE) out.push({ key: "w.home.readiness.factLoad", muscle: null, value: endFatigue });

  if (bio && bioAdj !== 0) out.push({ key: "w.home.readiness.factWearable", muscle: null, value: bioAdj });

  // THE HEAT LINE, for exactly the reason the wearable line above it exists: a
  // positive credit takes no arc and no ledger row (it shrinks every other
  // share instead), so without this a sauna that was logged AND moved the
  // score would show nothing anywhere on the card. Suppressed days say nothing
  // here — the ledger has a wearable line and the sauna took no points, so
  // there is no figure to report.
  if (heat > 0) out.push({ key: "w.home.readiness.factHeat", muscle: null, value: heat });

  return out;
}

/** What shape today's readiness read takes. */
export type ReadinessVerdictKind = "empty" | "clear" | "limiter" | "engine" | "recovery";

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
   * How many rows actually sit behind the door — the length of the deficit's
   * own `costs`. The door labels itself from this, so it can never offer three
   * reasons and open onto two.
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

/** The faces, as i18n keys. */
export const READINESS_VERDICT_KEY: Record<ReadinessVerdictKind, string> = {
  empty: "w.home.readiness.verdictEmpty",
  clear: "w.home.readiness.verdictClear",
  limiter: "w.home.readiness.verdictLimiter",
  engine: "w.home.readiness.verdictEngine",
  recovery: "w.home.readiness.verdictRecovery",
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
 *
 * THE HEAT PRIOR HAS TO COME IN HERE TOO, and its absence was a live defect.
 * `readinessDeficit` takes the heat credit; this did not, so it computed a
 * SECOND split from a different reading of the same day. On any day with a
 * logged sauna the two disagreed by exactly the credit — the door said "Where
 * the 33 went" off this function while the ledger it opened summed to 28 off
 * the ring's, and the bar beside it printed "Spent 28". A door that promises a
 * figure the thing behind it does not add up to is the precise failure the sum
 * law exists to make impossible, reintroduced one layer up by passing one term
 * to one caller.
 *
 * It is OPTIONAL and defaults to 0, so every caller that has no heat signal to
 * pass resolves exactly as before; the two surfaces that draw the ring pass the
 * same `heatAdj` they hand `readinessDeficit`, from the one reading of the day
 * their block computes. Pinned by readiness-verdict.test.ts.
 */
export function readinessVerdict(log: TrainingLog, bio?: Biometrics, heatAdj = 0): ReadinessVerdict {
  const fatigue = computeFatigue(log);
  const split = readinessDeficit(log, bio, heatAdj);
  const deficit = split.deficit;
  // The count is the number of LEDGER ROWS behind the door, not the number of
  // English sentences: the door opens onto the split now, and the prose it used
  // to open onto is gone from both cards. The two happened to agree at three on
  // a typical day, which is exactly how the door would have started promising
  // three of something no longer there.
  const reasons = split.costs.length;
  const doorKey = deficit > 0 ? "w.home.readiness.door" : "w.home.readiness.doorClear";
  const base = { muscle: null as MuscleGroup | null, deficit, reasons, doorKey };

  if (log.length === 0) return { ...base, kind: "empty", key: READINESS_VERDICT_KEY.empty };

  // The face names whichever cause the RING draws biggest, so the sentence and
  // the arcs can't tell two stories. A cause has to clear its own bar to speak:
  // the tissue term needs a tissue actually fatigued (the same threshold the
  // derivation uses), and the other two need to have cost more than a rounding
  // point. When nothing qualifies, the honest face is the positive one.
  const topMuscle = (Object.entries(fatigue.muscles) as [MuscleGroup, number][]).reduce((a, b) => (b[1] > a[1] ? b : a));
  const ranked = [...split.costs].sort((a, b) => b.points - a.points);
  for (const cost of ranked) {
    if (cost.kind === "tissue" && topMuscle[1] >= LIMITER_FATIGUE) {
      return { ...base, kind: "limiter", key: READINESS_VERDICT_KEY.limiter, muscle: topMuscle[0] };
    }
    if (cost.kind === "conditioning" && cost.points >= MEANINGFUL_COST) {
      return { ...base, kind: "engine", key: READINESS_VERDICT_KEY.engine };
    }
    if (cost.kind === "wearable" && cost.points >= MEANINGFUL_COST) {
      return { ...base, kind: "recovery", key: READINESS_VERDICT_KEY.recovery };
    }
  }
  return { ...base, kind: "clear", key: READINESS_VERDICT_KEY.clear };
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
export function performanceTrajectory(
  log: TrainingLog,
  days = 14,
  bio?: Biometrics,
  /**
   * The heat prior, applied to the `daysAgo === 0` point ONLY — exactly the
   * rule `bio` already takes, and for exactly the same reason: there is no
   * stored history of past sittings to replay against past days, and today's
   * point is the one the card also prints as a figure. Break the symmetry and
   * the headline figure disagrees with the sparkline 8 px away, which is the
   * defect the last Performance rebuild existed to fix.
   */
  heatAdj = 0,
): TrajectoryPoint[] {
  const out: TrajectoryPoint[] = [];
  for (let n = days - 1; n >= 0; n--) {
    const subLog = log
      .filter((s) => s.daysAgo >= n)
      .map((s) => ({ ...s, daysAgo: s.daysAgo - n }));
    const fatigue = computeFatigue(subLog);
    const today = n === 0 ? bio : undefined;
    const todayHeat = n === 0 ? heatAdj : 0;
    out.push({
      daysAgo: n,
      hpi: computeHpi(fatigue, today).score,
      readiness: computeReadiness(fatigue, today, todayHeat).score,
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
