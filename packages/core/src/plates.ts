import { kgToUnit, type WeightUnit } from "./units";

// Barbell plate maths. Given a total barbell load (stored kg) + the display
// unit, work out the plates to hang PER SIDE. Pure + unit-agnostic — the UI
// shows it as a loading hint under a strength exercise.

const PLATES: Record<WeightUnit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};
/** Standard Olympic bar in each unit. */
export const BAR_WEIGHT: Record<WeightUnit, number> = { kg: 20, lb: 45 };

export interface PlateLoad {
  /** plates per side, heaviest first (in the display unit) */
  perSide: number[];
  /** true when the target can't be hit exactly with standard plates */
  remainder: number;
  bar: number;
}

/**
 * Plates per side for a total barbell load. `totalKg` is the stored (kg) load;
 * the result is expressed in `units`. Returns an empty plate list when the load
 * is at/below the bar. Greedy largest-first; any unloadable remainder is
 * reported so the UI can flag "≈".
 */
export function platesPerSide(totalKg: number, units: WeightUnit): PlateLoad {
  const bar = BAR_WEIGHT[units];
  const total = kgToUnit(totalKg, units);
  let perSide = (total - bar) / 2;
  const out: number[] = [];
  if (perSide > 0) {
    for (const p of PLATES[units]) {
      while (perSide >= p - 1e-6) {
        out.push(p);
        perSide -= p;
      }
    }
  }
  return { perSide: out, remainder: Math.max(0, Math.round(perSide * 100) / 100), bar };
}
