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

/**
 * Split a formatted figure ("22.6 t", "1,240 lb") into its VALUE and its UNIT,
 * so a card can set the number big and the unit small beside it. Both clients
 * read the same split — a figure typeset two different ways on two screens is
 * the same drift this scale exists to prevent. A string with no unit comes back
 * with an empty one.
 */
export function splitFigure(s: string): [value: string, unit: string] {
  const i = s.lastIndexOf(" ");
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

/** Format big tonnage: metric tonnes in kg mode, total pounds in lb mode. */
export function fmtTonnage(kg: number, u: WeightUnit): string {
  if (u === "kg") return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kgToUnit(kg, "lb")).toLocaleString()} lb`;
}

// ── Height (cm ⇄ in) ─────────────────────────────────────────────────────────
// Storage is ALWAYS canonical centimetres, exactly like weight is always kg.
// There is no separate height preference: an athlete who weighs themselves in
// pounds measures themselves in inches, so the height unit FOLLOWS the weight
// unit rather than adding a second switch nobody would find.

export type HeightUnit = "cm" | "in";

const CM_PER_IN = 2.54;

/** The height unit that goes with a weight unit. kg → cm, lb → in. */
export const heightUnitFor = (u: WeightUnit): HeightUnit => (u === "lb" ? "in" : "cm");

/** cm → the chosen height unit (raw, unrounded). */
export const cmToHeightUnit = (cm: number, h: HeightUnit): number => (h === "in" ? cm / CM_PER_IN : cm);
/** the chosen height unit → cm (raw, unrounded). */
export const heightUnitToCm = (v: number, h: HeightUnit): number => (h === "in" ? v * CM_PER_IN : v);

/** A standing height the app will accept — below/above this is a typo, not an
 *  athlete. Mirrors the /api/body guard and the volume profile's field bounds. */
export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 230;

/** Is this a plausible standing height in cm? */
export const isPlausibleHeightCm = (cm: unknown): cm is number =>
  typeof cm === "number" && Number.isFinite(cm) && cm >= HEIGHT_MIN_CM && cm <= HEIGHT_MAX_CM;

/** A STORED height as the string an editable field should hold, in the unit
 *  that goes with `u`. cm keeps one decimal at most; inches keep one decimal
 *  (a whole inch is 2.5 cm, which is too coarse to round to). */
export function displayHeight(cm: number, u: WeightUnit): string {
  const v = cmToHeightUnit(cm, heightUnitFor(u));
  return String(Math.round(v * 10) / 10);
}

/** An INPUT string (typed in the unit that goes with `u`) → stored cm, or null
 *  when it isn't a plausible height. */
export function storeHeightCm(input: string, u: WeightUnit): number | null {
  const n = parseFloat(input.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const cm = Math.round(heightUnitToCm(n, heightUnitFor(u)) * 10) / 10;
  return isPlausibleHeightCm(cm) ? cm : null;
}

/**
 * Format a stored height for display: `"183 cm"` in metric, `"6'0\""` in
 * imperial. Feet-and-inches rather than bare inches because "72 in" is not how
 * anyone says their own height — the INPUT stays a single inches field (two
 * coupled boxes on two clients buys nothing), and this is the readback.
 */
export function fmtHeight(cm: number, u: WeightUnit): string {
  if (heightUnitFor(u) === "cm") return `${Number(cm.toFixed(1))} cm`;
  const totalIn = Math.round(cmToHeightUnit(cm, "in"));
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  return `${ft}'${inch}"`;
}
