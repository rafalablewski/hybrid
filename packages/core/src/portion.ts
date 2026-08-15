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
 * ── A FOOD'S PORTIONS COME FROM WHEREVER THEY ARE CHEAPEST ────────────────
 * "The whole bottle" is one tap only if the app knows how big the bottle is —
 * and there are millions of products, so ASKING is the answer of last resort,
 * not first. A food therefore carries a LIST of named portions, each recording
 * WHERE IT CAME FROM, and the four sources are tried in order of how little the
 * athlete has to do:
 *
 *   catalog  Open Food Facts publishes the net quantity on the pack
 *            (`quantity` / `product_quantity`). Free, and it covers the long
 *            tail no human would ever type in.
 *   scanned  A barcode identifies one specific PACKAGE — that is what a barcode
 *            is for — so a scan carries its pack size with it.
 *   learned  What the athlete actually logs, over and over (`usualAmounts`).
 *            This is the answer for the deli counter and the homemade loaf,
 *            which no catalog has ever heard of. NOT a `PortionSource`: see
 *            the note at the end of this list.
 *   typed    They told us. Correct as a fallback, wrong as the only route.
 *
 * A LIST rather than one pack, because real foods have several: a cheese has a
 * slice and a block, a bread has a slice and a loaf. `source` is stored with
 * each one so a figure the catalog published is never confused with one the
 * athlete corrected — and so the athlete's own always wins the tie.
 *
 * WHAT IS NOT A SOURCE: a category guess ("cheese ≈ 30 g a slice"). Every rule
 * in this codebase points the other way, and a wrong portion is worse than a
 * missing one because nothing on screen admits it guessed. Coverage gaps are
 * filled by the four above or left honestly empty.
 *
 * A LEARNED amount is deliberately NOT a named portion. It has no name — its
 * name is its size — so it is offered as a prefill on the measure unit ("you
 * usually log 35 g") rather than invented into a unit called something.
 *
 * Pure + unit-tested, and shared, so a portion converts identically wherever it
 * is edited.
 */

import { parseServing, servingGrams, unitById, type Serving } from "./serving-units";

/* ── A FOOD'S NAMED PORTIONS ──────────────────────────────────────────────── */

/** Where a portion came from. Kept ON the portion, because a size the catalog
 *  published and one the athlete corrected are not the same claim, and the tie
 *  between them has to break the same way every time. */
export type PortionSource = "catalog" | "scanned" | "typed";

/** The athlete's own beats a scan, which beats what the catalog published: each
 *  step down is a step further from the pack actually in their hand.
 *
 *  THERE IS NO "learned" HERE, deliberately. A learned amount is not a named
 *  portion — see the module note — so a fourth rank would be a value nothing
 *  can ever hold, sitting in the type inviting somebody to write it. */
const SOURCE_RANK: Record<PortionSource, number> = { typed: 3, scanned: 2, catalog: 1 };

export interface FoodPortion {
  /** what to call it — "bottle", "slice", "tub". EMPTY means the generic pack,
   *  localized at read time: the catalog publishes a net quantity and no word
   *  for the container, and inventing an English one would be a translation
   *  nobody asked for stored in the database. */
  label: string;
  /** its size in the food's OWN measure — grams for a food sold by weight,
   *  millilitres for one sold by volume */
  size: number;
  source: PortionSource;
}

/** Read a portions list off a JSON column / an API body without trusting it.
 *  Anything malformed is dropped rather than defaulted: a portion with no size
 *  is a unit worth nothing, and one with a size but no food is not a portion. */
export function parseFoodPortions(input: unknown): FoodPortion[] {
  if (!Array.isArray(input)) return [];
  const out: FoodPortion[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const size = parsePackSize(r.size);
    if (size == null) continue;
    const source = typeof r.source === "string" && r.source in SOURCE_RANK ? (r.source as PortionSource) : "typed";
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 24) : "";
    out.push({ label, size, source });
  }
  return dedupePortions(out);
}

/** How many named portions the editor will offer. Past this the unit switch is
 *  a list, not a switch — and a food with seven named portions is a food whose
 *  serving should have been defined differently. */
export const MAX_FOOD_PORTIONS = 5;

/**
 * Collapse portions that say the same thing, keeping the best-sourced one.
 *
 * The four sources OVERLAP by design — a scanned barcode and the catalog entry
 * behind it are the same pack — so without this a bottle appears twice on the
 * unit switch, which reads as two different bottles until you check that they
 * agree. Identity is the LABEL plus the SIZE: a 400 g bottle and a 1 kg bottle
 * are genuinely two portions, and two 400 g entries are one.
 */
export function dedupePortions(portions: readonly FoodPortion[]): FoodPortion[] {
  const best = new Map<string, FoodPortion>();
  for (const p of portions) {
    const key = `${p.label.toLowerCase()}|${p.size}`;
    const prev = best.get(key);
    if (!prev || SOURCE_RANK[p.source] > SOURCE_RANK[prev.source]) best.set(key, p);
  }
  // Smallest first: a slice before a block, so the unit switch reads from the
  // amount you eat most often to the one you eat least.
  return [...best.values()].sort((a, b) => a.size - b.size).slice(0, MAX_FOOD_PORTIONS);
}

/* ── THE UNITS THE STEPPER CAN COUNT ──────────────────────────────────────── */

/** What KIND of thing the stepper is counting — the switch's own grammar. */
export type PortionUnitKind = "servings" | "measure" | "portion";

export interface PortionUnit {
  /** stable within one food's list: "servings", "measure", or "portion:<n>" —
   *  the caller's selection key, so a re-render cannot select a different unit */
  id: string;
  kind: PortionUnitKind;
  /** how many SERVINGS one of this unit is — the whole conversion, in a number */
  servingsPer: number;
  /** the symbol printed under the stepper ("g", "ml"); null for the units whose
   *  word is the caller's to localize (servings, and a portion's own label) */
  symbol: string | null;
  /** the word for a portion ("bottle"), or "" for the generic pack */
  portionLabel?: string | null;
  /** where a portion unit's size came from — null on servings and the measure,
   *  which are read off the food's own serving label */
  source?: PortionSource | null;
  /** what one press of −/+ moves. A serving is a coarse thing and steps by a
   *  half; grams are fine-grained and step by five, because a scale reads 35 g
   *  and not 35.5 g and a 1 g step would be forty presses to a portion. */
  step: number;
  /** the smallest amount this unit can hold — one step, never zero: an entry of
   *  nothing is a delete, and the editor has a close button for that. */
  min: number;
  /** the amount the editor opens on. One serving, one bottle — and for a
   *  measure, one serving's worth, because that is what the food already states. */
  initial: number;
}

/** What the editor needs to know about the food in front of it. Deliberately
 *  the fields a FoodProduct (and a search hit, and a recent) already carries. */
export interface PortionFood {
  /** the stored serving label — "100 g", "1 scoop", "250 ml" */
  serving?: string | null;
  /** the serving's weight in grams, when it was actually recorded */
  servingGrams?: number | null;
  /** the food's named portions, from any of the four sources */
  portions?: readonly FoodPortion[] | null;
  /** LEGACY, and read-only: the single pack the first cut of this feature
   *  stored. Folded into `portions` by `foodPortions` so a food saved before
   *  the list existed keeps its bottle. Nothing writes these any more. */
  packSize?: number | null;
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

/**
 * A food's named portions, from every source it has one — including the single
 * pack the first cut of this feature stored, folded in so nothing that was
 * already recorded is lost.
 *
 * Empty when the food has no MEASURE: a size with no unit to read it in is a
 * number nobody can act on, and the one thing this module will not do is guess
 * which unit was meant.
 */
export function foodPortions(food: PortionFood, measure = portionMeasure(food)): FoodPortion[] {
  if (!measure) return [];
  const listed = parseFoodPortions(food.portions ?? []);
  const legacy = parsePackSize(food.packSize);
  if (legacy == null) return listed;
  return dedupePortions([...listed, { label: food.packLabel?.trim() ?? "", size: legacy, source: "typed" }]);
}

/**
 * The units this food can be logged in, in the order the editor offers them.
 *
 * Servings always — every food has one, and it is what the label states. Then
 * the measure, if the food can honestly be measured. Then one unit per named
 * portion. A food with only a count serving and no weight gets exactly one
 * unit, which is the truth about it rather than a control that cannot work.
 */
export function portionUnits(food: PortionFood): PortionUnit[] {
  const out: PortionUnit[] = [
    { id: "servings", kind: "servings", servingsPer: 1, symbol: null, source: null, step: 0.5, min: 0.5, initial: 1 },
  ];
  const measure = portionMeasure(food);
  if (!measure) return out;

  const step = STEP_FOR[measure.unit] ?? 0.5;
  out.push({
    id: "measure",
    kind: "measure",
    servingsPer: round(1 / measure.perServing, 6),
    symbol: measure.unit,
    source: null,
    step,
    min: step,
    // One serving's worth: the editor opens on the amount the food already
    // states, so switching units never silently changes what is being logged.
    initial: measure.perServing,
  });

  for (const p of foodPortions(food, measure)) {
    out.push({
      // Keyed by WHAT IT IS, not by where it sits: the list re-sorts by size
      // whenever a portion is added, so an index would silently point at a
      // different portion than the one the athlete had selected.
      id: portionUnitId(p),
      kind: "portion",
      servingsPer: round(p.size / measure.perServing, 6),
      symbol: null,
      portionLabel: p.label,
      source: p.source,
      step: 0.5,
      min: 0.5,
      initial: 1,
    });
  }
  return out;
}

/** A portion's stable unit id. Exported so a caller can select one it just
 *  wrote without waiting for a re-render to tell it the index. */
export const portionUnitId = (p: FoodPortion): string => `portion:${p.label}|${p.size}`;

export const portionUnit = (units: PortionUnit[], id: string): PortionUnit | undefined =>
  units.find((u) => u.id === id);

/** Just the food's named portions, as units — what a row offers as one-tap
 *  amounts. Servings and the measure are not packs: they are what the label
 *  states and what a scale reads, and neither is a thing you can hold. */
export const namedPortionUnits = (food: PortionFood): PortionUnit[] =>
  portionUnits(food).filter((u) => u.kind === "portion");

/**
 * DROP A PORTION — the counterpart to remembering one, and the half that was
 * missing.
 *
 * Every one of the four sources could ADD a pack to a food and nothing could
 * take one off it: a bottle typed as 400 when the scale said 450, a catalog net
 * quantity for the multipack when the athlete buys singles, a scan that read
 * the outer carton. A wrong unit on the switch is worse than a missing one,
 * because logging "1 bottle" through it writes a wrong number into the day and
 * nothing on screen admits where it came from.
 *
 * Removal is by UNIT ID rather than by index for the same reason selection is
 * (`portionUnits`): the list re-sorts by size on every write, so an index names
 * a different portion than the one the athlete was holding.
 *
 * ONE CAVEAT THE CALLER MUST HONOUR: a food saved before the list existed keeps
 * its pack in the legacy `packSize`/`packLabel` columns, which `foodPortions`
 * folds back in at READ time. Filtering the stored list alone would therefore
 * delete that pack for exactly as long as it takes to reload. So pass the
 * FOLDED list in (what `foodPortions(food)` returned) and clear the legacy pair
 * in the same write — see the pantry's removePortion.
 */
export function removeFoodPortion(portions: readonly FoodPortion[], unitId: string): FoodPortion[] {
  return dedupePortions(portions.filter((p) => portionUnitId(p) !== unitId));
}

/** One of a unit, ready to log — the whole bottle in a single tap, without the
 *  portion editor being opened to press one chip and then Log. Returns the
 *  quantity the macros scale by AND the portion as entered, so the diary row
 *  reads "1 bottle" rather than "4". */
export function oneOfPortion(unit: PortionUnit): { qty: number; amount: number; amountUnit: string } {
  return { qty: portionQty(1, unit), ...loggedPortionOf(1, unit) };
}

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

/* ── WHAT THE DIARY REMEMBERS ─────────────────────────────────────────────
 *
 * A diary entry stores per-serving macros and a QUANTITY, which is the right
 * shape for every engine downstream and the wrong thing to show a person: log
 * 35 g of a 100 g food and the row read "0.35". The number is correct and it is
 * not the number the athlete entered — they weighed 35 grams, and the row
 * should say so.
 *
 * So an entry also carries the amount AS ENTERED and the unit it was entered
 * in. It is a RECORD, not a second source of truth: `qty` still drives every
 * total, and the two stay in step because a quantity edit rescales the amount
 * by the same ratio (`rescaleLoggedAmount`) — the ratio between them is fixed
 * for a given food and unit, so this can never drift.
 *
 * `amountUnit` holds a measure SYMBOL ("g", "ml" — the same token in every
 * language this app ships), the athlete's own word for their container
 * ("bottle" — already in their language, because they typed it), or one of two
 * CANONICAL tokens that are localized when printed. Storing a translated word
 * would leave last month's entries speaking a language the athlete has since
 * switched away from.
 */

/** The canonical unit tokens — localized at read time, never stored translated. */
export const LOGGED_SERVING_UNIT = "serving";
export const LOGGED_PACK_UNIT = "pack";

/** A logged entry, as far as this module is concerned. */
export interface LoggedPortion {
  /** the number the athlete entered, in `amountUnit` — null on entries logged
   *  before this shipped, and on the paths that have no amount to record
   *  (a quick macro line, a copied preset) */
  amount?: number | null;
  amountUnit?: string | null;
  /** servings — what the macros are multiplied by, and always present */
  qty: number;
}

/** What to write alongside the quantity when a portion is logged. */
export function loggedPortionOf(amount: number, unit: PortionUnit): { amount: number; amountUnit: string } {
  const unitToken = unit.symbol
    ?? (unit.kind === "portion" ? (unit.portionLabel?.trim() || LOGGED_PACK_UNIT) : LOGGED_SERVING_UNIT);
  return { amount: round(amount, 2), amountUnit: unitToken };
}

/**
 * What the Diary row prints in front of its macros — "35 g", "1 bottle".
 *
 * Null when the amount adds nothing: an entry with no amount on record, and an
 * entry counted in SERVINGS, where the bare number beside the stepper has always
 * meant servings and a label repeating it would be noise on every row.
 */
export function loggedAmountLabel(e: LoggedPortion, words: { pack: string }): string | null {
  const a = e.amount;
  if (a == null || !Number.isFinite(a) || a <= 0) return null;
  const u = e.amountUnit;
  if (!u || u === LOGGED_SERVING_UNIT) return null;
  return `${formatAmount(a)} ${u === LOGGED_PACK_UNIT ? words.pack : u}`;
}

/** The number the row's stepper shows: the amount when one was recorded, the
 *  quantity otherwise. */
export function loggedAmountShown(e: LoggedPortion): number {
  const a = e.amount;
  if (a == null || !Number.isFinite(a) || a <= 0 || !e.amountUnit) return e.qty;
  return round(a, 2);
}

/** Keep the amount in step with a quantity edit. The ratio between them is
 *  fixed for a given food and unit, so scaling by the quantity's own ratio is
 *  exact rather than a re-derivation that could disagree. */
export function rescaleLoggedAmount(amount: number | null | undefined, fromQty: number, toQty: number): number | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  if (!Number.isFinite(fromQty) || fromQty <= 0 || !Number.isFinite(toQty) || toQty <= 0) return null;
  return round(amount * (toQty / fromQty), 2);
}

/**
 * One press of the Diary row's −/+, in the entry's OWN unit.
 *
 * A row logged in grams steps by five grams, not by half a serving — stepping
 * an entry by a unit it was never entered in is how a measured 35 g became 50 g
 * on the first tap. Entries with no amount keep the half-serving grid they have
 * always had.
 */
export function stepLoggedPortion(e: LoggedPortion, direction: number, maxQty = 50): { qty: number; amount: number | null } {
  const qty = Number.isFinite(e.qty) && e.qty > 0 ? e.qty : 1;
  const a = e.amount;
  const u = e.amountUnit;
  const servings = portionUnits({})[0]!;
  if (a == null || !Number.isFinite(a) || a <= 0 || !u || u === LOGGED_SERVING_UNIT) {
    const next = portionStep(qty, servings, direction, maxQty);
    return { qty: next, amount: u === LOGGED_SERVING_UNIT ? next : null };
  }
  // The entry's own conversion, recovered from what it stored: `qty / amount`
  // is how many servings one of its units is.
  const servingsPer = qty / a;
  const step = STEP_FOR[u] ?? 0.5;
  const unit: PortionUnit = { id: "measure", kind: "measure", servingsPer, symbol: u, step, min: step, initial: a };
  const amount = portionStep(a, unit, direction, servingsPer > 0 ? maxQty / servingsPer : a);
  return { qty: round(amount * servingsPer, 4), amount };
}

/* ── LEARNED: WHAT THIS ATHLETE ACTUALLY LOGS ─────────────────────────────── */

/** An amount the athlete keeps entering for a food, and how many times. */
export interface UsualAmount {
  amount: number;
  /** the measure unit it was entered in — "g" or "ml" */
  unit: string;
  times: number;
}

/** How many times an amount has to appear before it is a habit rather than a
 *  coincidence. Two is a repeat; three is what somebody does. */
export const USUAL_AMOUNT_MIN = 3;

/**
 * The amounts this athlete usually logs for a food, most-used first.
 *
 * THIS IS THE SOURCE FOR EVERYTHING THE CATALOG HAS NEVER HEARD OF — the deli
 * counter, the homemade loaf, the bakery down the road — which is most of what
 * a person actually eats. It costs nothing to collect, because the diary
 * already records what was entered and in which unit (`loggedPortionOf`).
 *
 * Deliberately NOT turned into a named portion. A learned amount has no name —
 * its name is its size — so it is offered as a prefill on the measure unit,
 * where "35 g" reads as exactly what it is. Inventing a word for it would put a
 * label in the database that the athlete never chose and cannot correct.
 *
 * Amounts are matched EXACTLY rather than clustered. 35 g and 36 g are two
 * different weighings, and a tracker that quietly merged them would be
 * answering with a number that was never on the scale.
 */
export function usualAmounts(
  entries: readonly { name?: string | null; amount?: number | null; amountUnit?: string | null }[],
  foodName: string,
  opts?: { min?: number; limit?: number },
): UsualAmount[] {
  const want = foldPortionName(foodName);
  if (!want) return [];
  const min = opts?.min ?? USUAL_AMOUNT_MIN;
  const counts = new Map<string, UsualAmount>();
  for (const e of entries) {
    if (foldPortionName(e.name ?? "") !== want) continue;
    const amount = e.amount;
    const unit = e.amountUnit;
    // Only a MEASURE is a usable suggestion: "1.5 servings" is not an amount
    // anybody weighed, and a portion unit is already on the switch above.
    if (amount == null || !Number.isFinite(amount) || amount <= 0) continue;
    if (!unit || STEP_FOR[unit] == null) continue;
    const key = `${unit}|${round(amount, 2)}`;
    const prev = counts.get(key);
    if (prev) prev.times += 1;
    else counts.set(key, { amount: round(amount, 2), unit, times: 1 });
  }
  return [...counts.values()]
    .filter((u) => u.times >= min)
    // Most-used first; the smaller amount breaks a tie, because the portion you
    // eat more often is usually the smaller one.
    .sort((a, b) => b.times - a.times || a.amount - b.amount)
    .slice(0, opts?.limit ?? 3);
}

/**
 * The habit, ready to log — what a one-tap ⊕ should actually write for a food
 * the athlete keeps weighing.
 *
 * Null when there is no habit, or when the food's measure has moved out from
 * under it (its serving was edited from grams to a count, say). Falling back to
 * "one serving" in that case is deliberate and happens in the caller: a tap
 * that logged nothing because the amount could not be converted would be a
 * control that silently stopped working.
 */
export function usualLogPortion(
  food: PortionFood,
  usual: UsualAmount | null | undefined,
): { qty: number; amount: number; amountUnit: string } | null {
  if (!usual) return null;
  const measure = portionMeasure(food);
  if (!measure || measure.unit !== usual.unit || measure.perServing <= 0) return null;
  const qty = round(usual.amount / measure.perServing, 4);
  return qty > 0 ? { qty, amount: usual.amount, amountUnit: usual.unit } : null;
}

/** Accent-folded, case-folded — the same fold the pantry and the picker apply,
 *  so "Twaróg" and "twarog" are one food here too. */
const foldPortionName = (s: string): string =>
  s.toLowerCase().replace(/\u0142/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

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
