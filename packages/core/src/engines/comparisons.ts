import { fmtTonnage, type WeightUnit } from "../units";
import { isWorkingSet, sessionVolume, type SessionBlock } from "./session";

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
  /** a big emoji for the slide flourish. */
  emoji: string;
}

interface Tier {
  min: number;
  key: string;
  emoji: string;
}

// Ascending thresholds. The highest tier a value reaches wins.
const VOLUME_TIERS: Tier[] = [
  { min: 100, key: "funfact.vol.0", emoji: "🐼" },
  { min: 250, key: "funfact.vol.1", emoji: "🥤" },
  { min: 500, key: "funfact.vol.2", emoji: "🎹" },
  { min: 1000, key: "funfact.vol.3", emoji: "🦛" },
  { min: 2000, key: "funfact.vol.4", emoji: "🚗" },
  { min: 5000, key: "funfact.vol.5", emoji: "🐘" },
  { min: 10000, key: "funfact.vol.6", emoji: "🚌" },
];

const REPS_TIERS: Tier[] = [
  { min: 50, key: "funfact.reps.0", emoji: "💪" },
  { min: 100, key: "funfact.reps.1", emoji: "😅" },
  { min: 200, key: "funfact.reps.2", emoji: "🔁" },
  { min: 400, key: "funfact.reps.3", emoji: "🤖" },
  { min: 800, key: "funfact.reps.4", emoji: "🥵" },
];

const DIST_TIERS: Tier[] = [
  { min: 3, key: "funfact.dist.0", emoji: "🏃" },
  { min: 5, key: "funfact.dist.1", emoji: "🏞️" },
  { min: 10, key: "funfact.dist.2", emoji: "🔥" },
  { min: 21, key: "funfact.dist.3", emoji: "🏅" },
  { min: 42, key: "funfact.dist.4", emoji: "🏆" },
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
  return { metric: best.metric, value: best.value, key: tier.key, emoji: tier.emoji };
}

/** Totals → fun fact, computed straight from a session's blocks. */
export function sessionFunFact(blocks: SessionBlock[]): FunFact | null {
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
  return workoutFunFact({ volume: sessionVolume(blocks), reps, distanceKm: Math.round(distanceKm * 10) / 10 });
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
