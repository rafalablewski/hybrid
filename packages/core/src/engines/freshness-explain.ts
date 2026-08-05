import type { Biometrics, EnergySystem, MuscleGroup, TrainingLog } from "./types";
import { hpiRole, type SemanticRole } from "../semantic";
import { ALL_MUSCLES, movementFor } from "./movements";
import { computeFatigue, ENDURANCE_SCALE, FATIGUE_HALF_LIFE_DAYS } from "./fatigue";
import { computeHpi, hpiBand, HYBRID_WEIGHTS, type HpiBand, type HpiWeights } from "./hpi";

/**
 * WHAT "STRENGTH FRESH" AND "ENDURANCE FRESH" ACTUALLY MEAN.
 *
 * The Performance card prints the two pillar figures as bare numerals under two
 * mono labels — "62 / STRENGTH FRESH". A number with no derivation is a number
 * an athlete cannot argue with, and the whole reason readiness stopped being
 * prose (see readiness-deficit.ts) was that a figure which can't be audited is
 * a figure nobody trusts on the day it says something inconvenient. These two
 * had no door at all.
 *
 * This module is that door's contents. It answers three questions per pillar,
 * in the order an athlete actually asks them:
 *
 *   WHAT IS IT     — freshness, not fitness. 100 means nothing has loaded this
 *                    system lately; it says nothing about how strong you are.
 *   WHAT'S IN IT   — the measured inputs, itemised: the seven tissues for
 *                    strength, the three energy systems for endurance, each
 *                    with the share of the fatigue it currently carries.
 *   HOW IT'S MADE  — the arithmetic, as a ledger that ends on the very figure
 *                    the card prints.
 *
 * THE LAW, and the reason this has its own tests: `score` is the SAME number
 * `computeHpi().components[pillar]` returns, and the ledger's last step IS that
 * score. The explainer recomputes nothing by hand — it calls the same engine
 * the card calls and then narrates what went in. A sheet that opens onto
 * different arithmetic than the figure it was opened from is worse than no
 * sheet.
 *
 * KEYS, NOT PROSE. Every label is an i18n key so the explanation speaks Polish
 * and German — unlike `readinessWhy`, which is English-only and is why that
 * pattern is not repeated here.
 */

/** Which of the two 0..100 pillars is being explained. */
export type FreshnessPillar = "strength" | "endurance";

/** One measured input behind the figure. */
export interface FreshnessRow {
  /** i18n key for the label, or null when `muscle` names the row instead. */
  key: string | null;
  /** The tissue, for a strength row — resolve through `w.home.today.muscle.*`. */
  muscle: MuscleGroup | null;
  /**
   * A tissue's fatigue, 0..100. For an energy system this is the raw decayed
   * load instead — an unbounded figure in the engine's own units, which is
   * exactly why the endurance ledger has a saturation step and the strength one
   * doesn't.
   */
  value: number;
  /** Share of this pillar's total load, whole percent — what the bar draws. */
  sharePct: number;
  /** The row currently carrying the most of it. Exactly one row, or none. */
  top: boolean;
  /**
   * ONE PAINT, the same rule readiness-deficit's segments follow: the row
   * carries the role it is drawn from, so neither client derives a colour of
   * its own. The vocabulary is deliberately the readiness ledger's — the tissue
   * term is `danger`, the conditioning term is `info` — so a tissue means the
   * same colour whichever card the athlete is reading.
   */
  role: SemanticRole;
  /** Held back, for every row that isn't the heaviest. Travels with the row for
   *  the same reason `RingSegment.dim` does: so the rule reaches every surface. */
  dim: boolean;
}

/** One line of the arithmetic, in the order it is performed. */
export interface FreshnessStep {
  /** i18n key for the line; `{n}` is substituted with `arg` when present. */
  key: string;
  /** The figure in the right-hand column. */
  value: number;
  /** A constant the line names (the saturation scale), or null. */
  arg: number | null;
  /** The result line — the figure the card prints. Exactly one step has it. */
  total: boolean;
}

export interface FreshnessExplain {
  pillar: FreshnessPillar;
  /** THE FIGURE. Identical to `computeHpi().components[pillar]`, by construction. */
  score: number;
  /** What the score is 100 minus. */
  fatigue: number;
  /** Banded by the SAME rule as the headline, so the colours can't diverge. */
  band: HpiBand;
  role: SemanticRole;
  /** The measured inputs: seven tissues, or three energy systems. */
  rows: FreshnessRow[];
  /** The arithmetic, ending on `score`. */
  steps: FreshnessStep[];
  /** This pillar's share of the headline Freshness figure, whole percent. */
  weightPct: number;
  /** The decay the window is built on — stated, never hard-coded in copy. */
  halfLifeDays: number;
  /**
   * Nothing logged at all. The figure is then a resting baseline rather than a
   * measurement, and the sheet has to say so — the same honesty `readinessWhy`
   * owes an empty log.
   */
  empty: boolean;
  /**
   * The log is not empty but NOTHING IN IT FEEDS THIS PILLAR — a month of
   * running with no lifting reads "Strength fresh 100", and that 100 is the
   * absence of input, not a measured all-clear. Without this flag the two cases
   * are indistinguishable on the card and the sheet would explain a measurement
   * that never happened.
   */
  noInput: boolean;
}

/** The three energy systems in one fixed order — an intensity ladder, hardest
 *  first. The type is `types.ts`'s own `EnergySystem`; this is the drawing
 *  order the sheet reads them in. */
export const ENERGY_SYSTEMS: EnergySystem[] = ["anaerobic", "threshold", "aerobic"];
export const ENERGY_SYSTEM_KEY: Record<EnergySystem, string> = {
  anaerobic: "w.home.fresh.system.anaerobic",
  threshold: "w.home.fresh.system.threshold",
  aerobic: "w.home.fresh.system.aerobic",
};

/** The sheet's copy blocks, per pillar. Keys, so the clients can't drift. */
export const FRESHNESS_COPY: Record<FreshnessPillar, {
  /** The sheet's own title — the SAME key the card's column label uses. */
  title: string;
  what: string;
  how: string;
  inputs: string;
  /** The caveat: what a high figure does NOT mean. */
  limit: string;
  /** The zero-input line, when the log carries nothing this pillar can read. */
  noInput: string;
}> = {
  strength: {
    title: "w.home.cockpit.strengthFresh",
    what: "w.home.fresh.strength.what",
    how: "w.home.fresh.strength.how",
    inputs: "w.home.fresh.strength.inputs",
    limit: "w.home.fresh.strength.limit",
    noInput: "w.home.fresh.strength.noInput",
  },
  endurance: {
    title: "w.home.cockpit.enduranceFresh",
    what: "w.home.fresh.endurance.what",
    how: "w.home.fresh.endurance.how",
    inputs: "w.home.fresh.endurance.inputs",
    limit: "w.home.fresh.endurance.limit",
    noInput: "w.home.fresh.endurance.noInput",
  },
};

/** Whole-percent share of `total`, floored at 0 and safe when nothing loaded. */
const share = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

/**
 * Does the log carry anything this pillar can read?
 *
 * Strength reads items whose movement maps onto at least one tissue; endurance
 * reads items that name an energy system. Asked of the WHOLE log rather than of
 * the decayed totals, because "you last lifted three weeks ago" and "you have
 * never lifted" are different sentences and only the second is `noInput`.
 */
function feedsPillar(log: TrainingLog, pillar: FreshnessPillar): boolean {
  for (const session of log) {
    for (const it of session.items) {
      if (pillar === "endurance") {
        if (it.system) return true;
        continue;
      }
      if ((movementFor(it.move)?.muscles.length ?? 0) > 0) return true;
    }
  }
  return false;
}

/**
 * Explain one pillar of the Freshness figure, from the athlete's own log.
 *
 * `bio` is accepted and DELIBERATELY unused by the pillars themselves: the
 * wearable is a ±15 additive on the headline, not a term in either component
 * (see computeHpi), and a sheet that folded it in here would be explaining a
 * different number from the one it was opened from. It is taken so the call
 * site reads like every other engine call on the page, and so the day the
 * wearable does touch a component this signature does not have to change.
 */
export function freshnessExplain(
  pillar: FreshnessPillar,
  log: TrainingLog,
  bio?: Biometrics,
  weights: HpiWeights = HYBRID_WEIGHTS,
): FreshnessExplain {
  const fatigueState = computeFatigue(log);
  // THE SAME CALL THE CARD MAKES. Not a re-derivation — the figure printed on
  // the card and the figure this sheet explains are one value read twice.
  const hpi = computeHpi(fatigueState, bio, weights);
  const score = hpi.components[pillar];
  const fatigue = 100 - score;
  const wSum = weights.strength + weights.endurance || 1;
  const weightPct = Math.round((weights[pillar] / wSum) * 100);

  const base = {
    pillar,
    score,
    fatigue,
    band: hpiBand(score),
    role: hpiRole(hpiBand(score)),
    weightPct,
    halfLifeDays: FATIGUE_HALF_LIFE_DAYS,
    empty: log.length === 0,
    noInput: !feedsPillar(log, pillar),
  };

  if (pillar === "strength") {
    // The seven tissues, heaviest first — the sheet exists to answer "which one
    // is holding this down", and a fixed alphabetical order answers it slowest.
    const total = ALL_MUSCLES.reduce((a, m) => a + fatigueState.muscles[m], 0);
    const sorted = [...ALL_MUSCLES].sort((a, b) => fatigueState.muscles[b] - fatigueState.muscles[a]);
    const heaviest = sorted[0];
    const rows: FreshnessRow[] = sorted.map((m) => {
      // Only a tissue actually carrying load can be "the one" — at a clean
      // slate every tissue reads 0 and pointing at one of them would be noise.
      const top = m === heaviest && fatigueState.muscles[m] > 0;
      return {
        key: null,
        muscle: m,
        value: fatigueState.muscles[m],
        sharePct: share(fatigueState.muscles[m], total),
        top,
        role: "danger" as SemanticRole,
        dim: !top,
      };
    });
    return {
      ...base,
      rows,
      steps: [
        // `fatigue` IS the rounded average: computeHpi does round(100 − avg),
        // so 100 − score reproduces it exactly rather than approximating it.
        { key: "w.home.fresh.stepAverage", value: fatigue, arg: ALL_MUSCLES.length, total: false },
        { key: "w.home.fresh.stepResult", value: score, arg: null, total: true },
      ],
    };
  }

  // ENDURANCE. Fixed order, hardest system first: unlike the tissues, these
  // three are a ladder an athlete can learn, and re-sorting them by value each
  // day would cost that for nothing.
  const loads = ENERGY_SYSTEMS.map((s) => Math.round(fatigueState.systems[s]));
  const total = loads.reduce((a, b) => a + b, 0);
  let heaviestIdx = 0;
  loads.forEach((v, i) => { if (v > (loads[heaviestIdx] ?? 0)) heaviestIdx = i; });
  const rows: FreshnessRow[] = ENERGY_SYSTEMS.map((s, i) => {
    const top = i === heaviestIdx && (loads[i] ?? 0) > 0;
    return {
      key: ENERGY_SYSTEM_KEY[s],
      muscle: null,
      value: loads[i] ?? 0,
      sharePct: share(loads[i] ?? 0, total),
      top,
      role: "info" as SemanticRole,
      dim: !top,
    };
  });
  return {
    ...base,
    rows,
    steps: [
      { key: "w.home.fresh.stepLoad", value: total, arg: null, total: false },
      { key: "w.home.fresh.stepSaturate", value: fatigue, arg: ENDURANCE_SCALE, total: false },
      { key: "w.home.fresh.stepResult", value: score, arg: null, total: true },
    ],
  };
}
