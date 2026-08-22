/**
 * WHAT ONE SET LIFTED, as a string — bodyweight included.
 *
 * WHY THIS EXISTS. A set row rendered `s.load` raw, and `s.load` is empty for
 * every bodyweight lift: a session whose header read "Pull-Up 75 kg" printed
 * five rows of "– × 7" beneath it. The athlete's own weight was already on
 * hand — the header figure came from `blockTopLoad(b, bwHere)`, two lines up in
 * the same component — so the row was the only place on the screen that did not
 * know what a pull-up weighs.
 *
 * It resolves through `effectiveSetLoadKg`, the same helper the tonnage, the
 * top set and the muscle map all read, so a row can never disagree with the
 * totals it adds up to. Assisted lifts (band, machine) come back as bodyweight
 * MINUS the assistance, which is the load that actually moved.
 *
 * Returns null when there is nothing to say — a set measured in seconds or
 * metres, or an unweighted move with no bodyweight on file — so the caller
 * keeps its own em dash rather than being handed a "0 kg" that asserts a
 * measurement nobody took.
 */
import { effectiveSetLoadKg } from "./engines/session";
import { fmtWeight, type WeightUnit } from "./units";

export function setLoadText(
  exerciseName: string,
  load: string,
  bodyweightKg: number | null | undefined,
  units: WeightUnit,
  locale?: string,
): string | null {
  const kg = effectiveSetLoadKg(exerciseName, load, bodyweightKg);
  if (!(kg > 0)) return null;
  return fmtWeight(kg, units, undefined, locale);
}
