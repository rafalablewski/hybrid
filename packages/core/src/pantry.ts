/**
 * THE PANTRY — the athlete's own saved foods, organised.
 *
 * The products screen was a flat list under a search box: every saved food in
 * one column, newest first, with a ⊕ and an ×. That is fine at four foods and
 * useless at forty — the screen every other tab of this app answers with
 * structure (Today's clusters, Performance's four sections) answered with a
 * scroll.
 *
 * ── THE CATEGORIES ARE DERIVED, NOT TYPED ─────────────────────────────────
 * The obvious way to categorise foods is a keyword lexicon — "chicken" is meat,
 * "bread" is grains — and it is the wrong way here, twice over. It GUESSES: a
 * lexicon puts "coconut oil" under produce and files anything it has never seen
 * under Other, and a category that is sometimes wrong is worse than no category
 * because the shelf it hides a food on is the shelf nobody looks at. And it does
 * not survive the app's own languages: this ships in EN, PL and DE, so a lexicon
 * is three lexicons, drifting.
 *
 * So a food's shelf comes from ITS OWN NUMBERS — where the energy in a serving
 * actually comes from. That is arithmetic on data we already hold, it is right
 * in every language, it has no unseen case, and it is the question an athlete
 * asks a food library anyway: show me my protein.
 *
 * ── WHY PROTEIN WINS AT A LOWER BAR ───────────────────────────────────────
 * A single "≥ 50 % of the energy" rule reads an egg (52 kcal protein, 99 kcal
 * fat) as a fat, which is arithmetically true and useless to somebody stocking
 * a protein shelf. Protein is the nutrient this app tracks against a target and
 * the reason a food gets bought, so it claims a food at PROTEIN_SHARE (0.30)
 * while carbs and fat need DOMINANT_SHARE (0.55) — and anything that satisfies
 * neither is honestly MIXED rather than being forced onto a shelf. A serving
 * carrying almost no energy at all (a spice, black coffee, a zero drink) is
 * LIGHT: shares of nearly nothing are noise, and rounding them would file
 * pepper as a carbohydrate.
 *
 * Pure + unit-tested, and shared, so the phone and the browser shelve a food
 * identically (parity rule).
 */

import { foldFoodName, factsCompleteness, type NutritionFacts } from "./food-facts";

/** Where a serving's energy comes from — the shelf a food stands on. */
export type FoodRole = "protein" | "carb" | "fat" | "mixed" | "light";

/** Shelf order: the three sources, then the ones that are neither. */
export const FOOD_ROLES: readonly FoodRole[] = ["protein", "carb", "fat", "mixed", "light"] as const;

/** Below this much macro energy in a serving, shares are noise (see the note). */
export const PANTRY_LIGHT_KCAL = 20;
/** Protein's claim on a food — deliberately lower than the others. */
export const PANTRY_PROTEIN_SHARE = 0.3;
/** What carbs or fat need to claim a food outright. */
export const PANTRY_DOMINANT_SHARE = 0.55;

/** A saved food, as both clients already store it (FoodProduct is exactly this). */
export interface PantryFood extends NutritionFacts {
  id: string;
  name: string;
  subname?: string | null;
  servingLabel?: string | null;
}

/** Where a serving's energy comes from, as three shares that sum to 1 (or to 0
 *  when the serving carries no macro energy at all — never NaN). */
export function roleShares(f: Pick<NutritionFacts, "protein" | "carbs" | "fat">): {
  protein: number; carb: number; fat: number; kcal: number;
} {
  // The macros' OWN energy at 4·4·9, not the stated kcal: a share has to be a
  // share of something the three parts add up to, and a label's stated energy
  // includes fibre and rounding that no macro accounts for.
  const p = Math.max(0, f.protein) * 4;
  const c = Math.max(0, f.carbs) * 4;
  const g = Math.max(0, f.fat) * 9;
  const total = p + c + g;
  if (total <= 0) return { protein: 0, carb: 0, fat: 0, kcal: 0 };
  return { protein: p / total, carb: c / total, fat: g / total, kcal: total };
}

/** Which shelf a food stands on. See the file note for why the bars differ. */
export function foodRole(f: Pick<NutritionFacts, "protein" | "carbs" | "fat">): FoodRole {
  const s = roleShares(f);
  if (s.kcal < PANTRY_LIGHT_KCAL) return "light";
  if (s.protein >= PANTRY_PROTEIN_SHARE) return "protein";
  if (s.carb >= PANTRY_DOMINANT_SHARE) return "carb";
  if (s.fat >= PANTRY_DOMINANT_SHARE) return "fat";
  return "mixed";
}

/**
 * Does this food answer the typed query?
 *
 * Matches the name, the athlete's own subname and the serving label, all
 * accent-folded — someone who saved "Jogurt naturalny" must find it by typing
 * "jogurt", and someone looking for what they log by the 100 g finds it by
 * typing "100".
 */
export function matchesQuery(f: PantryFood, query: string): boolean {
  const q = foldFoodName(query);
  if (!q) return true;
  const hay = foldFoodName(`${f.name} ${f.subname ?? ""} ${f.servingLabel ?? ""}`);
  // Every word must appear somewhere, in any order: "whey choc" should find
  // "Chocolate whey" without the athlete having to remember the stored order.
  return q.split(" ").every((w) => hay.includes(w));
}

/** One shelf of the pantry. Generic over the caller's own row type: a client
 *  passes its stored food in whole and gets it back whole, rather than having
 *  the fields this engine doesn't read (a serving weight, a verified id)
 *  narrowed away on the trip through. */
export interface PantryShelf<T extends PantryFood = PantryFood> {
  role: FoodRole;
  items: T[];
}

/**
 * The pantry, shelved.
 *
 * Filtering happens BEFORE shelving, so a search inside a role narrows what is
 * already on screen instead of quietly re-populating shelves the athlete had
 * filtered away. Empty shelves are dropped — a heading over nothing is the
 * "category that is sometimes wrong" failure in another costume.
 */
export function pantryShelves<T extends PantryFood>(
  items: readonly T[],
  opts?: { query?: string; role?: FoodRole | null },
): PantryShelf<T>[] {
  const q = (opts?.query ?? "").trim();
  const kept = items.filter((f) => (q ? matchesQuery(f, q) : true))
    .filter((f) => (opts?.role ? foodRole(f) === opts.role : true));
  return FOOD_ROLES
    .map((role) => ({
      role,
      // Alphabetical INSIDE a shelf: a library is looked up, not scrolled
      // through by recency — the newest-first order the API returns is right
      // for a feed and wrong for a shelf you are trying to find a jar on.
      items: kept.filter((f) => foodRole(f) === role)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((s) => s.items.length > 0);
}

/** How many foods stand on each shelf — the figure a filter chip carries, so a
 *  chip never offers a shelf that turns out to be empty. */
export function roleCounts(items: readonly PantryFood[]): Record<FoodRole, number> {
  const out = { protein: 0, carb: 0, fat: 0, mixed: 0, light: 0 } as Record<FoodRole, number>;
  for (const f of items) out[foodRole(f)] += 1;
  return out;
}

/** What the pantry hero states. */
export interface PantryStats {
  /** How many foods are saved. */
  count: number;
  /** How many state the WHOLE label panel (saturates, sugars, fibre, salt). */
  complete: number;
  /** Mean label completeness across the library, 0–1. */
  completeness: number;
  /** The most-populated shelf, or null when the pantry is empty or tied-empty. */
  lead: FoodRole | null;
}

/**
 * The one honest figure this screen can open with.
 *
 * Not "how many calories are in your pantry" (a pantry has no calories — it is
 * a list of things you might eat) and not a streak. How much of your library is
 * FULLY STATED is a fact about the data, it is the thing that limits what every
 * other nutrition screen can tell you, and it is fixable by hand — which is
 * what makes it worth putting at the top instead of a decoration.
 */
export function pantryStats(items: readonly PantryFood[]): PantryStats {
  const count = items.length;
  if (count === 0) return { count: 0, complete: 0, completeness: 0, lead: null };
  let sum = 0;
  let complete = 0;
  for (const f of items) {
    const c = factsCompleteness(f);
    sum += c;
    if (c === 1) complete += 1;
  }
  const counts = roleCounts(items);
  let lead: FoodRole | null = null;
  for (const r of FOOD_ROLES) if (counts[r] > 0 && (lead === null || counts[r] > counts[lead])) lead = r;
  return { count, complete, completeness: sum / count, lead };
}
