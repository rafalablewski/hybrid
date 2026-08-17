import { fmtTonnage, type WeightUnit } from "../units";
import { roundKm } from "../distance";
import { isWorkingSet, sessionVolume, type SessionBlock } from "./session";
import { glyphMark, sportMarkOf, type Mark } from "../theme/mark";

/**
 * Playful "Hevy-style" post-workout comparisons — turn a session's raw effort
 * into a shareable one-liner ("you moved 1.2 t — about a small hippo").
 *
 * Pure + i18n-safe: the engine never returns English. Each tier maps to an i18n
 * KEY whose value is a full sentence containing a literal "{amount}" token, so
 * every language reads naturally (makeT has no interpolation). Use funFactText()
 * to render the final string.
 */

export type FunMetric = "volume" | "reps" | "distance";

export interface FunFact {
  metric: FunMetric;
  /** the metric's raw value — kg (volume), reps, or km (distance). */
  value: number;
  /** i18n sentence key; its value contains "{amount}". */
  key: string;
  /**
   * The slide's flourish, drawn.
   *
   * It used to be a per-tier EMOJI — 🐼 at 100 kg, 🎹 at 500, 🦛 at 1000, 🐘 at
   * 5000 — twenty pictographs chosen one tier at a time, watermarked at 22% of
   * the slide width. There is no line glyph for a panda and there should not
   * be: the comparison is the SENTENCE's job, and the sentence already says it.
   * The mark now states the METRIC instead, which is a thing the app's own
   * vocabulary can say, and it says it once per metric rather than once per
   * tier.
   */
  mark: Mark;
}

/** The mark a fact wears, by the metric it is about. Three decisions, not
 *  twenty. */
const FUN_FACT_MARK: Record<"volume" | "reps" | "distance", Mark> = {
  volume: glyphMark("barbell"),
  reps: glyphMark("sync"),
  distance: sportMarkOf("Running"),
};

interface Tier {
  min: number;
  key: string;
}

// Ascending thresholds. The highest tier a value reaches wins. The lowest
// (min ~0) tier is the entry level so ANY non-empty workout still gets a fact.
const VOLUME_TIERS: Tier[] = [
  { min: 1, key: "funfact.vol.s" },
  { min: 100, key: "funfact.vol.0" },
  { min: 250, key: "funfact.vol.1" },
  { min: 500, key: "funfact.vol.2" },
  { min: 1000, key: "funfact.vol.3" },
  { min: 2000, key: "funfact.vol.4" },
  { min: 5000, key: "funfact.vol.5" },
  { min: 10000, key: "funfact.vol.6" },
];

const REPS_TIERS: Tier[] = [
  { min: 1, key: "funfact.reps.s" },
  { min: 50, key: "funfact.reps.0" },
  { min: 100, key: "funfact.reps.1" },
  { min: 200, key: "funfact.reps.2" },
  { min: 400, key: "funfact.reps.3" },
  { min: 800, key: "funfact.reps.4" },
];

const DIST_TIERS: Tier[] = [
  { min: 0.5, key: "funfact.dist.s" },
  { min: 3, key: "funfact.dist.0" },
  { min: 5, key: "funfact.dist.1" },
  { min: 10, key: "funfact.dist.2" },
  { min: 21, key: "funfact.dist.3" },
  { min: 42, key: "funfact.dist.4" },
];

/** Index of the highest tier the value reaches, or -1 if it clears none. */
function tierIndex(tiers: Tier[], v: number): number {
  let idx = -1;
  for (let i = 0; i < tiers.length; i++) if (v >= tiers[i]!.min) idx = i;
  return idx;
}

/**
 * Pick the most impressive fun fact for a session's totals. The metric reaching
 * the highest tier wins, so a heavy lifting day shows volume while a long run
 * shows distance — natural variety without randomness. Ties favour volume, then
 * distance, then reps. Returns null when nothing clears the lowest tier.
 */
export function workoutFunFact(input: { volume: number; reps: number; distanceKm: number }): FunFact | null {
  const candidates: { metric: FunMetric; idx: number; value: number; tiers: Tier[] }[] = [
    { metric: "volume", idx: tierIndex(VOLUME_TIERS, input.volume), value: input.volume, tiers: VOLUME_TIERS },
    { metric: "distance", idx: tierIndex(DIST_TIERS, input.distanceKm), value: input.distanceKm, tiers: DIST_TIERS },
    { metric: "reps", idx: tierIndex(REPS_TIERS, input.reps), value: input.reps, tiers: REPS_TIERS },
  ];
  let best = candidates[0]!;
  for (const c of candidates) if (c.idx > best.idx) best = c; // strict → earlier metric wins ties
  if (best.idx < 0) return null;
  const tier = best.tiers[best.idx]!;
  return { metric: best.metric, value: best.value, key: tier.key, mark: FUN_FACT_MARK[best.metric] };
}

/** Totals → fun fact, computed straight from a session's blocks. */
export function sessionFunFact(blocks: SessionBlock[], bodyweightKg?: number | null): FunFact | null {
  let reps = 0;
  let distanceKm = 0;
  for (const b of blocks) {
    if (b.kind === "strength") {
      for (const s of b.sets) {
        if (!isWorkingSet(s)) continue;
        const r = parseFloat(s.reps);
        if (Number.isFinite(r)) reps += r;
      }
    } else if (b.kind === "cardio") {
      if (typeof b.distance === "number" && Number.isFinite(b.distance)) distanceKm += b.distance;
    }
  }
  return workoutFunFact({ volume: sessionVolume(blocks, false, bodyweightKg), reps, distanceKm: roundKm(distanceKm) });
}

/** The formatted amount for a fun fact (tonnage for volume, km, or a rep count). */
export function funFactAmount(fact: FunFact, units: WeightUnit): string {
  if (fact.metric === "volume") return fmtTonnage(fact.value, units);
  if (fact.metric === "distance") return `${fact.value} km`;
  return String(fact.value);
}

/** The rendered, localized one-liner with {amount} filled in. */
export function funFactText(fact: FunFact, units: WeightUnit, t: (k: string) => string): string {
  return t(fact.key).replace("{amount}", funFactAmount(fact, units));
}
