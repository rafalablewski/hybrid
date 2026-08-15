/**
 * THE PORTION — how much of a food you are actually logging.
 *
 * The portion editor could only count SERVINGS. A food saved as "100 g – 50 kcal"
 * (which is how a label is written, and therefore how nearly every food in the
 * pantry is saved) could be logged as 1 serving, 1.5, 2 — and that is not what
 * anybody eats. You put the cheese on the scale and it says 35 g. You drink the
 * bottle of kefir, and the bottle is 400 ml. Neither of those is a multiple of
 * a hundred grams, and asking the athlete to divide by the serving in their head
 * before they can log breakfast is the tracker doing arithmetic AT the user
 * instead of FOR them.
 *
 * ── A UNIT, NOT A MODE ────────────────────────────────────────────────────
 * The fix is not a second screen; it is admitting the number in the stepper has
 * a unit. `portionUnits(food)` returns the units THIS food can honestly be
 * measured in, each carrying `servingsPer` — how many servings one of it is —
 * so every unit converts through the same multiplication and the diary keeps
 * storing exactly what it stores today: per-serving macros with a quantity.
 * Nothing downstream changes shape; 35 g of a 100 g serving is `qty` 0.35.
 *
 * ── THE MEASURE FOLLOWS THE SERVING'S KIND, AND NEVER CROSSES ─────────────
 * A food whose serving is a MASS is measured in grams. A food whose serving is
 * a VOLUME is measured in millilitres. We do NOT offer grams for a food sold in
 * millilitres (or the reverse): that conversion needs a density this app does
 * not have and must not invent — the same line serving-units.ts already draws
 * when it flags a volume→gram conversion `assumed`. A serving that is a COUNT
 * ("1 slice", "1 scoop") gets a measure only when a weight was actually
 * recorded for it, because nobody can weigh "1 medium" without being told.
 *
 * ── THE PACK IS THE FOOD'S OWN FACT, SO IT IS STORED ON THE FOOD ──────────
 * "The whole bottle" is one tap only if the app knows how big the bottle is.
 * That is a property of the product — it is printed on it — not of tonight's
 * log, so it lives on FoodProduct (`packSize` + `packLabel`) and is recorded
 * once. It is deliberately a SIZE plus a WORD rather than a second serving row:
 * the athlete's container is called a bottle, a tub or a pack, and a unit list
 * that made them pick "serving" again would be the same shrug that started this.
 *
 * Pure + unit-tested, and shared, so a portion converts identically wherever it
 * is edited.
 */

import { parseServing, servingGrams, unitById, type Serving } from "./serving-units";

/** What the stepper is counting. */
export type PortionUnitId = "servings" | "measure" | "pack";

export interface PortionUnit {
  id: PortionUnitId;
  /** how many SERVINGS one of this unit is — the whole conversion, in a number */
  servingsPer: number;
  /** the symbol printed under the stepper ("g", "ml", "oz"); null for the two
   *  units whose word is the caller's to localize (servings, and the pack's own
   *  label, which the athlete typed) */
  symbol: string | null;
  /** the athlete's word for a pack ("bottle") — only ever set on `pack` */
  packLabel?: string | null;
  /** what one press of −/+ moves. A serving is a coarse thing and steps by a
   *  half; grams are fine-grained and step by five, because a scale reads 35 g
   *  and not 35.5 g and a 1 g step would be forty presses to a portion. */
  step: number;
  /** the smallest amount this unit can hold — one step, never zero: an entry of
   *  nothing is a delete, and the editor has a close button for that. */
  min: number;
  /** the amount the editor opens on. One serving, one pack — and for a measure,
   *  one serving's worth, because that is the amount the food already states. */
  initial: number;
}

/** What the editor needs to know about the food in front of it. Deliberately
 *  the fields a FoodProduct (and a search hit, and a recent) already carries. */
export interface PortionFood {
  /** the stored serving label — "100 g", "1 scoop", "250 ml" */
  serving?: string | null;
  /** the serving's weight in grams, when it was actually recorded */
  servingGrams?: number | null;
  /** the whole container, in the serving's OWN measure (grams for a food sold
   *  by weight, millilitres for one sold by volume) */
  packSize?: number | null;
  /** what the athlete calls that container — "bottle", "tub", "pack" */
  packLabel?: string | null;
}

/** How much of the measure unit one serving is, and which unit that is. */
export interface PortionMeasure {
  /** a serving-units registry id — "g" or "ml", the unit a kitchen scale and a
   *  carton are both marked in */
  unit: string;
  /** how much of it ONE serving is: 100 for "100 g", 250 for "250 ml" */
  perServing: number;
}

/** g and ml step by five; anything else (an ounce serving, say) by a half. */
const STEP_FOR: Record<string, number> = { g: 5, ml: 5 };

/**
 * The measure this food can be weighed or poured in, or null when it has none.
 *
 * A STORED weight wins over a derived one — the same doctrine device-truth
 * applies to a watch recording, and the reason a food saved as "1 scoop" with a
 * measured 30 g becomes measurable at all.
 */
export function portionMeasure(food: PortionFood): PortionMeasure | null {
  const s: Serving = parseServing(food.serving);
  const u = s.unit ? unitById(s.unit) : undefined;

  // A VOLUME serving is measured in millilitres, exactly, with no density in
  // sight. This is the case a stored servingGrams cannot help with and must not
  // be allowed to: the create form deliberately never stores an assumed weight.
  if (u && u.kind === "volume" && u.base != null) {
    const perServing = round(s.qty * u.base, 2);
    return perServing > 0 ? { unit: "ml", perServing } : null;
  }

  // Everything else measures in grams — from the recorded weight when there is
  // one, otherwise from an EXACT mass conversion of the label itself.
  const stored = food.servingGrams;
  if (stored != null && Number.isFinite(stored) && stored > 0) return { unit: "g", perServing: round(stored, 2) };
  const derived = servingGrams(s);
  if (derived && !derived.assumed && derived.grams > 0) return { unit: "g", perServing: round(derived.grams, 2) };
  return null;
}

/** The pack, expressed in the food's measure — null when either is missing. A
 *  pack size with no measure to read it in is a number without a unit, and the
 *  one thing this module will not do is guess which. */
export function portionPack(food: PortionFood, measure = portionMeasure(food)): { size: number; unit: string; label: string | null } | null {
  const size = food.packSize;
  if (!measure) return null;
  if (size == null || !Number.isFinite(size) || size <= 0) return null;
  return { size: round(size, 2), unit: measure.unit, label: food.packLabel?.trim() || null };
}

/**
 * The units this food can be logged in, in the order the editor offers them.
 *
 * Servings always — every food has one, and it is what the label states. Then
 * the measure, if the food can honestly be measured. Then the pack, if one was
 * recorded. A food with only a count serving and no weight gets exactly one
 * unit, which is the truth about it rather than a control that cannot work.
 */
export function portionUnits(food: PortionFood): PortionUnit[] {
  const out: PortionUnit[] = [
    { id: "servings", servingsPer: 1, symbol: null, step: 0.5, min: 0.5, initial: 1 },
  ];
  const measure = portionMeasure(food);
  if (measure) {
    const step = STEP_FOR[measure.unit] ?? 0.5;
    out.push({
      id: "measure",
      servingsPer: round(1 / measure.perServing, 6),
      symbol: measure.unit,
      step,
      min: step,
      // One serving's worth: the editor opens on the amount the food already
      // states, so switching units never silently changes what is being logged.
      initial: measure.perServing,
    });
  }
  const pack = portionPack(food, measure);
  if (pack && measure) {
    out.push({
      id: "pack",
      servingsPer: round(pack.size / measure.perServing, 6),
      symbol: null,
      packLabel: pack.label,
      step: 0.5,
      min: 0.5,
      initial: 1,
    });
  }
  return out;
}

export const portionUnit = (units: PortionUnit[], id: PortionUnitId): PortionUnit | undefined =>
  units.find((u) => u.id === id);

/**
 * The quantity a diary entry gets: how many SERVINGS this amount of this unit
 * is. Rounded to four places — enough that 35 g of a 3-gram serving stays
 * honest, tight enough that float noise never reaches the database.
 */
export function portionQty(amount: number, unit: PortionUnit): number {
  const a = Number.isFinite(amount) && amount > 0 ? amount : 0;
  return round(a * unit.servingsPer, 4);
}

/** The inverse — the amount of `unit` that shows the same portion. Used when
 *  the athlete switches units mid-edit: 1 serving becomes 100 g, not 1 g. */
export function portionAmount(qty: number, unit: PortionUnit): number {
  const q = Number.isFinite(qty) && qty > 0 ? qty : 0;
  if (unit.servingsPer <= 0) return 0;
  return round(q / unit.servingsPer, 2);
}

/** One press of −/+. Steps ON the unit's own grid when the amount is already on
 *  it, and OFF it otherwise: 35 g +5 is 40 g, but 0.35 servings +0.5 is 0.85 and
 *  NOT 0.5 — snapping to the grid would silently discard a weight somebody
 *  measured, which is the whole thing this module exists to preserve. */
export function portionStep(amount: number, unit: PortionUnit, direction: number, max = 10_000): number {
  const a = Number.isFinite(amount) ? amount : unit.initial;
  const onGrid = Math.abs(a / unit.step - Math.round(a / unit.step)) < 1e-9;
  const next = onGrid
    ? Math.round((a + direction * unit.step) / unit.step) * unit.step
    : a + direction * unit.step;
  return round(Math.min(max, Math.max(unit.min, next)), 2);
}

/** Print an amount: no trailing zeros, so 35 reads "35" and 0.35 reads "0.35". */
export const formatAmount = (n: number): string => String(round(n, 2));

/**
 * The line under the stepper — what this amount is in the food's OTHER terms.
 *
 * Returns null when there is nothing to add: a portion measured in servings by
 * a food that has no measure has nothing left to say, and repeating "1 serving"
 * under a stepper reading 1 serving is noise.
 */
export function portionEquivalent(
  amount: number,
  unit: PortionUnit,
  units: PortionUnit[],
): { amount: number; symbol: string } | null {
  const measure = portionUnit(units, "measure");
  if (!measure || unit.id === "measure") return null;
  const qty = portionQty(amount, unit);
  if (qty <= 0) return null;
  return { amount: portionAmount(qty, measure), symbol: measure.symbol! };
}

const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** Read a typed pack size + unit into the number stored on the product. The
 *  form offers the food's OWN measure, so this is a validation, not a
 *  conversion — but it is here rather than in a client so both a create form
 *  and an edit sheet write the field the same way. */
export function parsePackSize(input: unknown): number | null {
  const n = typeof input === "number" ? input : parseFloat(String(input ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(round(n, 2), 100_000);
}
