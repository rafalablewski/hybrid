import { parseServing, unitById, type Serving } from "./serving-units";
import type { NutritionFacts } from "./food-facts";
import type { RecipeIngredient } from "./recipes";

/**
 * MATCHING A WRITTEN INGREDIENT LINE TO A FOOD THAT STATES ITS NUMBERS.
 *
 * A curated recipe says "400 g Chopped tomatoes" and carries no macros for it;
 * the athlete's own library holds foods that do. This module is the join, and
 * it is deliberately DUMB: exact normalised names and exact unit arithmetic,
 * nothing else. It exists to serve two features that share this one hard part —
 * copying a library recipe into your own (`libraryRecipeToUserRecipe`) and, when
 * it lands, importing one from a link.
 *
 * ── THE RULE THAT SHAPES EVERY DECISION HERE ────────────────────────────────
 * A WRONG MATCH IS WORSE THAN NO MATCH. An unmatched line is now representable
 * — it becomes an `unstated` ingredient, visibly missing its numbers, and the
 * recipe refuses to be logged until it is resolved. A wrong one is a silent,
 * confident figure in the diary that nothing downstream can question. So every
 * ambiguity resolves to "no match":
 *
 *   • two candidates matching equally well → none, because picking the first
 *     alphabetically is a coin toss wearing a decision's clothes;
 *   • a name that only OVERLAPS ("tomato purée" for "chopped tomatoes") → none,
 *     they are different foods with different numbers;
 *   • units that cannot be converted exactly → none, including anything
 *     `servingGrams` had to ASSUME (a volume converted at water density is a
 *     guess about the food, not arithmetic).
 *
 * NO FUZZY DISTANCE, no synonym table, no language guessing. A near-miss
 * threshold is a dial someone tunes until the demo looks good, and every notch
 * of it buys matches with wrong numbers.
 */

/** A food that states its numbers — the athlete's saved products and the
 *  Verified catalog project onto this. */
export interface FoodCandidate {
  id: string;
  name: string;
  /** The source's own serving, e.g. "100 g", "1 medium", "1 scoop". */
  servingLabel: string;
  /** Facts for ONE of those servings. */
  facts: NutritionFacts;
  /** A measured serving weight, where the food recorded one. */
  servingGrams?: number | null;
  /** True for a HYBRID Verified item (it links by verifiedId, not productId). */
  verified?: boolean;
}

/**
 * A food name reduced to what two spellings of the same food share.
 *
 * Case, accents, punctuation and a trailing plural are noise; word ORDER is
 * not (it is kept, so "chicken stock" and "stock chicken" stay different). The
 * plural strip is length-guarded so "gas" does not become "ga".
 */
export function normalizeFoodName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

/**
 * The written line as a SERVING of its own — "400 g", "2 tbsp", "4".
 *
 * Reusing `parseServing` rather than a second parser is the point: the units a
 * recipe writes and the units a food is sold in are the same vocabulary, and
 * two tables would drift. A bare count ("4 eggs" — the recipe stores an empty
 * unit) parses as a count of servings, which is exactly what it is.
 */
function lineServing(line: RecipeIngredient, serves: number, baseServes: number): Serving {
  const scaled = (line.qty * serves) / Math.max(1, baseServes);
  return parseServing(`${scaled} ${line.unit}`.trim());
}

/**
 * How many of the candidate's servings the line asks for, or null when the two
 * cannot be reconciled exactly.
 *
 * The arithmetic happens in the line's OWN dimension — mass against mass,
 * volume against volume, count against count — because that is the only kind
 * that is arithmetic. Crossing dimensions needs the food's density, which
 * nobody here knows: 400 g of chopped tomatoes against a food sold by the cup
 * is a guess, and this module does not guess. A MEASURED serving weight is the
 * one bridge, and only for a mass line, because it is a fact the food recorded
 * rather than a conversion applied to it.
 *
 * The two sides are deliberately asymmetric about an unrecognised unit word. On
 * the CANDIDATE it means "one of these" ("1 medium", "1 egg") and counts as a
 * count. On the LINE it means an amount nobody can size — a handful, a bunch —
 * and is refused.
 */
export function convertQty(line: RecipeIngredient, candidate: FoodCandidate, serves: number, baseServes: number): number | null {
  const want = lineServing(line, serves, baseServes);
  if (want.qty <= 0) return null;
  const wantUnit = want.unit ? unitById(want.unit) : undefined;
  // A line measured in something this app has no definition for.
  if (!wantUnit) return null;

  const serving = parseServing(candidate.servingLabel);
  if (serving.qty <= 0) return null;
  const servingUnit = serving.unit ? unitById(serving.unit) : undefined;

  // A weight the food actually recorded outranks any conversion — the same
  // doctrine device-truth applies to a watch recording.
  const stored = candidate.servingGrams;
  if (wantUnit.kind === "mass" && stored != null && Number.isFinite(stored) && stored > 0) {
    return (want.qty * (wantUnit.base ?? 1)) / stored;
  }

  const servingKind = servingUnit?.kind ?? "count";
  if (wantUnit.kind !== servingKind) return null;
  if (wantUnit.kind === "count") return want.qty / serving.qty;
  if (wantUnit.base == null || servingUnit?.base == null) return null;
  return (want.qty * wantUnit.base) / (serving.qty * servingUnit.base);
}

/** The one candidate that unambiguously IS this line, with the quantity in the
 *  candidate's own servings — or null, which is a valid and common answer. */
export function matchRecipeLine(
  line: RecipeIngredient,
  candidates: FoodCandidate[],
  serves: number,
  baseServes: number,
): { candidate: FoodCandidate; qty: number } | null {
  const want = normalizeFoodName(line.name);
  if (!want) return null;
  const named = candidates.filter((c) => normalizeFoodName(c.name) === want);
  // Ambiguity is not resolved, it is reported as "no match" — see the file note.
  if (named.length !== 1) return null;
  const candidate = named[0]!;
  const qty = convertQty(line, candidate, serves, baseServes);
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return null;
  return { candidate, qty: Math.round(qty * 100) / 100 };
}
