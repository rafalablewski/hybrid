/**
 * SERVING UNITS — what "1 serving" actually is.
 *
 * A serving was FREE TEXT: the Create form composed "100" + "gram" into the
 * string `"100 g"` and threw the structure away. Nothing downstream could scale
 * it, convert it, or compare two foods measured differently, and `servingGrams`
 * — the field that makes per-100 g comparison and gram-based quick-add possible
 * — sat null on almost every product because nobody ever typed it separately.
 *
 * (The unit list was also a local array in ONE client, so the other never had
 * it at all. That is the drift this module exists to close, the same way
 * dock-rail.ts and rail-tail.tsx closed theirs.)
 *
 * ── IT PARSES WHAT IS ALREADY STORED, SO THERE IS NO MIGRATION ────────────
 * `parseServing("100 g")` recovers `{ qty: 100, unit: "g" }` from text that was
 * written before any of this existed. That is the whole reason this ships
 * without a schema change: every product already saved becomes measurable
 * today, rather than only the ones created after a column landed. A label that
 * genuinely has no structure ("1 medium", "a handful") parses to a COUNT of the
 * text it was, which is honest — it is a serving, we just cannot weigh it.
 *
 * ── GRAMS FROM MASS ARE EXACT. GRAMS FROM VOLUME ARE AN ASSUMPTION ────────
 * 8 oz is 226.8 g and always will be. 1 cup is 236.6 ml, and how many grams
 * that is depends entirely on what is in the cup — water and honey differ by
 * 40%. So `servingGrams()` reports `assumed: true` whenever it had to apply
 * water density, and callers that care (a per-100 g comparison, a gram-based
 * quick add) can say so or decline. Returning a bare number would let a cup of
 * flour be logged as 237 g with nothing on screen admitting the guess.
 *
 * Pure + unit-tested, and shared, so a serving reads and converts the same on
 * both clients (parity rule).
 */

export type UnitKind = "mass" | "volume" | "count";

export interface ServingUnit {
  id: string;
  kind: UnitKind;
  /** grams per unit (mass) or millilitres per unit (volume); null for a count */
  base: number | null;
  /** what to print after the number */
  symbol: string;
}

/**
 * The registry. Order is the order the picker offers them, so the units people
 * actually use lead. `serving` is last because it is the fallback, not a choice.
 */
export const SERVING_UNITS: ServingUnit[] = [
  { id: "g", kind: "mass", base: 1, symbol: "g" },
  { id: "kg", kind: "mass", base: 1_000, symbol: "kg" },
  { id: "oz", kind: "mass", base: 28.349523125, symbol: "oz" },
  { id: "lb", kind: "mass", base: 453.59237, symbol: "lb" },
  { id: "ml", kind: "volume", base: 1, symbol: "ml" },
  { id: "l", kind: "volume", base: 1_000, symbol: "l" },
  // US customary — the measures a recipe is written in.
  { id: "floz", kind: "volume", base: 29.5735295625, symbol: "fl oz" },
  { id: "cup", kind: "volume", base: 236.5882365, symbol: "cup" },
  { id: "tbsp", kind: "volume", base: 14.78676478125, symbol: "tbsp" },
  { id: "tsp", kind: "volume", base: 4.92892159375, symbol: "tsp" },
  { id: "piece", kind: "count", base: null, symbol: "piece" },
  { id: "slice", kind: "count", base: null, symbol: "slice" },
  { id: "scoop", kind: "count", base: null, symbol: "scoop" },
  { id: "serving", kind: "count", base: null, symbol: "serving" },
];

export const unitById = (id: string): ServingUnit | undefined => SERVING_UNITS.find((u) => u.id === id);

/** Every spelling that resolves to a unit, including the ones people type and
 *  the ones the OLD free-text form wrote ("gram"). */
const ALIASES: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gr: "g", gramme: "g", grammes: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  floz: "floz", "fl oz": "floz", fluidounce: "floz",
  cup: "cup", cups: "cup",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", each: "piece",
  slice: "slice", slices: "slice",
  scoop: "scoop", scoops: "scoop",
  serving: "serving", servings: "serving", portion: "serving", portions: "serving",
};

export const resolveUnit = (word: string): ServingUnit | undefined =>
  unitById(ALIASES[word.trim().toLowerCase()] ?? "");

/** A serving, with its structure recovered. */
export interface Serving {
  qty: number;
  /** a registry unit id, or null when the label named something we don't model */
  unit: string | null;
  /** the label's own word when `unit` is null ("medium", "handful") */
  freeUnit: string | null;
  /** the text this came from, kept so nothing is ever lost in a round-trip */
  raw: string;
}

const NUM = /^([0-9]+(?:[.,][0-9]+)?)/;

/**
 * Recover the structure of a stored serving label.
 *
 * A missing quantity is ONE ("scoop" is one scoop). A label we cannot resolve
 * keeps its own word in `freeUnit` rather than being forced into `serving`,
 * because "1 medium" and "1 serving" are different claims and flattening them
 * would lose the only description the athlete gave.
 */
export function parseServing(label: string | null | undefined): Serving {
  const raw = (label ?? "").trim();
  if (!raw) return { qty: 1, unit: "serving", freeUnit: null, raw: "" };

  const m = NUM.exec(raw);
  const qty = m ? parseFloat(m[1]!.replace(",", ".")) : 1;
  const rest = (m ? raw.slice(m[0].length) : raw).trim();

  if (!rest) {
    // A bare number is a count of servings — "2" means two of whatever this is.
    return { qty: Number.isFinite(qty) && qty > 0 ? qty : 1, unit: "serving", freeUnit: null, raw };
  }

  const unit = resolveUnit(rest);
  if (unit) return { qty: Number.isFinite(qty) && qty > 0 ? qty : 1, unit: unit.id, freeUnit: null, raw };

  // Try the FIRST word only — "1 cup chopped" is still a cup.
  const first = rest.split(/\s+/)[0]!;
  const head = resolveUnit(first);
  if (head) return { qty: Number.isFinite(qty) && qty > 0 ? qty : 1, unit: head.id, freeUnit: null, raw };

  return { qty: Number.isFinite(qty) && qty > 0 ? qty : 1, unit: null, freeUnit: rest, raw };
}

/** Print a serving. A count of one drops the number ("scoop", not "1 scoop")
 *  only for the generic `serving`; a real count keeps it, because "slice" alone
 *  reads as a type of food rather than an amount. */
export function formatServing(s: Serving): string {
  const qty = Math.round(s.qty * 100) / 100;
  if (s.unit) {
    const u = unitById(s.unit)!;
    if (u.id === "serving" && qty === 1) return u.symbol;
    return `${qty} ${u.symbol}`;
  }
  return `${qty} ${s.freeUnit ?? ""}`.trim();
}

export interface ServingGrams {
  grams: number;
  /** true when water density had to be assumed — see the file note */
  assumed: boolean;
}

/**
 * How many grams a serving weighs.
 *
 * Mass units are exact. Volume units are converted at water density and flagged
 * `assumed`, because how much a cup weighs depends on what is in it. Counts
 * return null: nobody can weigh "1 medium" without being told.
 *
 * `stored` — a servingGrams the food actually recorded — always wins. A measured
 * weight outranks a derived one, which is the same doctrine the device-truth
 * rule applies to a watch recording.
 */
export function servingGrams(s: Serving, stored?: number | null): ServingGrams | null {
  if (stored != null && Number.isFinite(stored) && stored > 0) return { grams: stored, assumed: false };
  if (!s.unit) return null;
  const u = unitById(s.unit)!;
  if (u.base == null) return null;
  const value = s.qty * u.base;
  return { grams: Math.round(value * 10) / 10, assumed: u.kind === "volume" };
}

/**
 * Convert a serving into another unit, when the two are compatible.
 *
 * Mass converts to mass and volume to volume. Mass does NOT convert to volume
 * and back — that needs a density this app does not have and should not invent.
 * A count converts to nothing.
 */
export function convertServing(s: Serving, toUnitId: string): Serving | null {
  const from = s.unit ? unitById(s.unit) : undefined;
  const to = unitById(toUnitId);
  if (!from || !to) return null;
  if (from.kind !== to.kind || from.base == null || to.base == null) return null;
  const qty = (s.qty * from.base) / to.base;
  return { qty: Math.round(qty * 1000) / 1000, unit: to.id, freeUnit: null, raw: s.raw };
}

/** The units a serving can be re-expressed in — for a portion editor's picker.
 *  Empty for a count, because "1 slice" is not 28 of anything. */
export const compatibleUnits = (s: Serving): ServingUnit[] => {
  const from = s.unit ? unitById(s.unit) : undefined;
  if (!from || from.base == null) return [];
  return SERVING_UNITS.filter((u) => u.kind === from.kind && u.base != null);
};

/**
 * Compose the stored label from a form's quantity + unit — the write half of
 * `parseServing`, so what the Create form saves is exactly what the parser will
 * read back. Both clients call this instead of concatenating their own string.
 */
export function composeServingLabel(qty: unknown, unitId: string): string {
  const n = typeof qty === "number" ? qty : parseFloat(String(qty ?? "").replace(",", "."));
  const q = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 1;
  const u = unitById(unitId) ?? unitById("serving")!;
  return formatServing({ qty: q, unit: u.id, freeUnit: null, raw: "" });
}

/** The picker's options, in registry order — replacing the local array that
 *  existed on ONE client and not the other. */
export const SERVING_UNIT_IDS: string[] = SERVING_UNITS.map((u) => u.id);
