// Weight units (kg ⇄ lb). Storage is ALWAYS canonical kilograms — these helpers
// convert only at the display/input boundary, so the engines, the DB and
// cross-device sync never have to care about the user's chosen unit.

export type WeightUnit = "kg" | "lb";

const KG_PER_LB = 0.45359237;

/** kg → the chosen unit (raw number, unrounded). */
export const kgToUnit = (kg: number, u: WeightUnit): number => (u === "lb" ? kg / KG_PER_LB : kg);
/** the chosen unit → kg (raw number, unrounded). */
export const unitToKg = (v: number, u: WeightUnit): number => (u === "lb" ? v * KG_PER_LB : v);

const roundDisp = (v: number, u: WeightUnit): number => (u === "lb" ? Math.round(v) : Math.round(v * 2) / 2);

/**
 * Convert a STORED kg load string to the display string in the chosen unit
 * (no unit suffix) — for editable inputs. kg passes through untouched; lb is
 * rounded to whole pounds. Non-numeric/blank passes through.
 */
export function displayLoad(kgStr: string, u: WeightUnit): string {
  if (u === "kg") return kgStr;
  const n = parseFloat(kgStr);
  if (!Number.isFinite(n)) return kgStr;
  return String(roundDisp(kgToUnit(n, u), u));
}

/** Convert an INPUT string (typed in the chosen unit) back to a stored kg string. */
export function storeLoad(input: string, u: WeightUnit): string {
  if (u === "kg") return input;
  const n = parseFloat(input);
  if (!Number.isFinite(n)) return input;
  return String(Math.round(unitToKg(n, u) * 100) / 100);
}

/** Format a kg number as a labelled weight, e.g. "102 kg" / "225 lb". */
export function fmtWeight(kg: number, u: WeightUnit, decimals?: number): string {
  const v = kgToUnit(kg, u);
  const d = decimals ?? (u === "lb" ? 0 : v % 1 === 0 ? 0 : 1);
  return `${Number(v.toFixed(d)).toLocaleString()} ${u}`;
}

/** Format big tonnage: metric tonnes in kg mode, total pounds in lb mode. */
export function fmtTonnage(kg: number, u: WeightUnit): string {
  if (u === "kg") return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kgToUnit(kg, "lb")).toLocaleString()} lb`;
}
