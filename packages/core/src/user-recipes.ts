/**
 * USER RECIPES — a recipe the athlete authored, as opposed to the curated
 * read-only library in recipes.ts.
 *
 * The two are deliberately different things and share no model. A RECIPES entry
 * is editorial content: a photo-less hero tint, a written note, a method with
 * per-step timers, and macros an author typed once. A user recipe is an
 * ARITHMETIC OBJECT — a list of real foods with real quantities whose totals
 * are DERIVED, never typed. Nobody knows the macros of the pasta they invented;
 * they know what went into it. That is the whole feature.
 *
 * ── EVERY TOTAL IS DERIVED, AND DERIVED THROUGH food-facts.ts ──────────────
 * Recipe totals go through `sumFacts`, which means they inherit the label-panel
 * discipline the rest of nutrition already obeys: a field is stated in the total
 * only when EVERY ingredient states it. Four ingredients with sugar plus one
 * that never stated it is NOT a known sugar total, and `partial` names exactly
 * which fields had to be dropped so the UI can say why a number is missing
 * instead of printing a wrong one. Per-serving figures divide through
 * `scaleFacts`, so an unknown stays unknown at any serving count.
 *
 * ── AN INGREDIENT CARRIES ITS OWN NUMBERS ─────────────────────────────────
 * Each ingredient stores a SNAPSHOT of the food's facts, even when it also
 * links to a saved product (`productId`) or a Verified item (`verifiedId`).
 * Two reasons, and they pull in the same direction:
 *
 *   1. A recipe must not break. Delete the product and a live-lookup recipe
 *      loses an ingredient's macros and silently under-totals — the exact
 *      failure the not-stated rule exists to prevent, arriving through the back
 *      door as a confident wrong number.
 *   2. A recipe is a record of what you made. If you correct a product's macros
 *      in March, the pasta you logged in February did not retroactively contain
 *      different food.
 *
 * The link is kept for PROVENANCE and for `staleIngredients`, which reports
 * where a snapshot has drifted from its source so the athlete can refresh it
 * DELIBERATELY. Silent recalculation and silent staleness are both wrong; a
 * visible, one-tap correction is right.
 *
 * Pure + unit-tested, and shared, so the totals on the phone and the totals in
 * the browser are the same totals (parity rule).
 */

import { scaleFacts, sumFacts, type MicroKey, type NutritionFacts } from "./food-facts";
import { recipeShareText, type Recipe, type RecipeShareView } from "./recipes";

/** One line of a recipe: a food, and how much of it went in. */
export interface UserRecipeIngredient {
  id: string;
  /** The name as it read when the ingredient was added. Always stored, so a
   *  deleted product leaves a named line rather than a blank one. */
  name: string;
  /** How many of the source's servings went in. 2.5 × "100 g" = 250 g. */
  qty: number;
  /** The source's own serving label, e.g. "100 g", "1 scoop", "1 medium". */
  servingLabel: string;
  /** The source food's facts for ONE serving — the snapshot (see the file note). */
  facts: NutritionFacts;
  /** The saved FoodProduct this came from, if any. Provenance + staleness only. */
  productId?: string | null;
  /** The HYBRID Verified catalog id this came from, if any. */
  verifiedId?: string | null;
  /** Render order within the recipe. */
  position: number;
}

export interface UserRecipe {
  id: string;
  name: string;
  /** The athlete's own note — "the way Mum makes it", "double the chilli". */
  note?: string | null;
  emoji?: string | null;
  /** How many servings the ingredient list as written produces. Always ≥ 1. */
  servings: number;
  /** Active time in minutes, when the athlete bothered to record it. */
  timeMins?: number | null;
  ingredients: UserRecipeIngredient[];
  createdAt?: string;
  updatedAt?: string;
}

/** The most servings a recipe may claim — a batch-cook ceiling, not a limit
 *  anybody sensible reaches. Guards the divide and the stepper alike. */
export const MAX_RECIPE_SERVINGS = 50;
/** The most ingredients one recipe may hold. */
export const MAX_RECIPE_INGREDIENTS = 40;

/** A recipe's servings, clamped and integral — the denominator of every
 *  per-serving figure, so it can never be 0, NaN or a fraction. */
export const recipeServings = (r: Pick<UserRecipe, "servings">): number =>
  Math.max(1, Math.min(MAX_RECIPE_SERVINGS, Math.round(r.servings) || 1));

/**
 * One ingredient's contribution — its snapshot scaled by how much went in.
 * An unstated field stays unstated at any quantity (`scaleFacts`).
 */
export const ingredientFacts = (ing: UserRecipeIngredient): NutritionFacts => scaleFacts(ing.facts, ing.qty);

export interface RecipeTotals {
  /** the whole recipe as written */
  total: NutritionFacts;
  /** one serving of it */
  perServing: NutritionFacts;
  /** panel fields dropped because at least one ingredient never stated them */
  partial: MicroKey[];
  servings: number;
  ingredientCount: number;
}

/**
 * The recipe's arithmetic. This is the ONE place a user recipe's numbers are
 * computed — both clients render from it, so the totals under the ingredient
 * list, the per-serving strip and the figure that gets logged to the diary can
 * never be three different answers.
 */
export function recipeTotals(r: UserRecipe): RecipeTotals {
  const servings = recipeServings(r);
  const { total, partial } = sumFacts(r.ingredients.map(ingredientFacts));
  return {
    total,
    // Dividing through scaleFacts rather than by hand keeps the not-stated rule:
    // a null over four servings is still a null, not a 0.
    perServing: scaleFacts(total, 1 / servings),
    partial,
    servings,
    ingredientCount: r.ingredients.length,
  };
}

/**
 * What logging `qty` servings of this recipe writes to the diary.
 *
 * The diary stores per-single-serving macros with a separate quantity, exactly
 * as a logged product does, so the entry stays editable by the same stepper
 * afterwards — a recipe must not become a special case the Diary can't rescale.
 */
export interface RecipeLogDraft {
  name: string;
  subname: string | null;
  facts: NutritionFacts;
  qty: number;
}

export function recipeToLog(r: UserRecipe, qty = 1): RecipeLogDraft {
  const { perServing, servings } = recipeTotals(r);
  const n = Number.isFinite(qty) && qty > 0 ? qty : 1;
  return {
    name: r.name,
    // What a serving IS — the reader of a two-month-old diary entry has no
    // other way to know whether "Chicken pasta" was a quarter of the tray.
    subname: `1 of ${servings}`,
    facts: perServing,
    qty: n,
  };
}

/**
 * The same draft, for a recipe out of the CURATED library (recipes.ts).
 *
 * Two things this deliberately does not do:
 *
 *   1. It does not log the whole tray. The detail's `serves` stepper scales the
 *      INGREDIENT list — how much you are cooking — which is a different number
 *      from how much you ate, and cooking four while eating one is the normal
 *      case. So `qty` defaults to ONE serving and the cook count only names the
 *      portion ("1 of 4"), exactly as a user recipe's does.
 *   2. It does not invent a panel. A curated recipe states four macros and
 *      nothing else, so satFat/sugar/fibre/salt stay NOT STATED rather than
 *      becoming zeros that would claim the dish is sugar-free.
 *
 * `Recipe.macros` is already per-serve and constant as `serves` changes, so
 * there is no arithmetic here beyond choosing what a serving means.
 */
export function libraryRecipeToLog(recipe: Recipe, qty = 1, serves?: number): RecipeLogDraft {
  const n = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const cooked = Math.max(1, Math.round(serves ?? recipe.baseServes) || 1);
  const m = recipe.macros;
  return {
    name: recipe.name,
    subname: `1 of ${cooked}`,
    facts: { kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, satFat: null, sugar: null, fiber: null, salt: null },
    qty: n,
  };
}

/**
 * Rewrite the ingredient quantities so the recipe yields `servings` instead of
 * what it yields now — the "I'm cooking for six tonight" case.
 *
 * This CHANGES the recipe (it is an edit, not a view), which is why it returns
 * a new recipe rather than a view model: scaling the yield without scaling the
 * ingredients would silently halve every serving, and scaling the ingredients
 * without saying so would be an edit the athlete didn't make. The caller saves
 * the result.
 */
export function scaleRecipeTo(r: UserRecipe, servings: number): UserRecipe {
  const from = recipeServings(r);
  const to = Math.max(1, Math.min(MAX_RECIPE_SERVINGS, Math.round(servings) || 1));
  if (to === from) return r;
  const factor = to / from;
  return {
    ...r,
    servings: to,
    ingredients: r.ingredients.map((ing) => ({
      ...ing,
      // Two decimals: an ingredient scaled from 3 to 4 servings lands on
      // repeating decimals, and "133.33 g of pasta" is a false precision that
      // makes the whole list look machine-generated.
      qty: Math.round(ing.qty * factor * 100) / 100,
    })),
  };
}

/** A food a recipe ingredient can be checked against (a saved product). */
export interface RecipeSource {
  id: string;
  name: string;
  servingLabel: string;
  facts: NutritionFacts;
}

export interface StaleIngredient {
  ingredientId: string;
  name: string;
  /** what the recipe believes */
  snapshot: NutritionFacts;
  /** what the linked product says now */
  current: NutritionFacts;
}

/**
 * Ingredients whose snapshot no longer matches the product they were taken
 * from — reported, never applied. See the file note: a recipe is a record of
 * what you made, so a correction to a product is an invitation to refresh, not
 * a retroactive rewrite of a meal you already ate.
 *
 * An ingredient whose product has been DELETED is not stale. It is exactly as
 * true as it was the day it was written; it has simply lost its link.
 */
export function staleIngredients(r: UserRecipe, sources: RecipeSource[]): StaleIngredient[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const out: StaleIngredient[] = [];
  for (const ing of r.ingredients) {
    if (!ing.productId) continue;
    const src = byId.get(ing.productId);
    if (!src) continue; // deleted — orphaned, not stale
    if (!sameFacts(ing.facts, src.facts)) {
      out.push({ ingredientId: ing.id, name: ing.name, snapshot: ing.facts, current: src.facts });
    }
  }
  return out;
}

/** Adopt the current numbers for the named ingredients. The caller saves. */
export function refreshIngredients(r: UserRecipe, sources: RecipeSource[], ids?: string[]): UserRecipe {
  const only = ids ? new Set(ids) : null;
  const byId = new Map(sources.map((s) => [s.id, s]));
  return {
    ...r,
    ingredients: r.ingredients.map((ing) => {
      if (!ing.productId) return ing;
      if (only && !only.has(ing.id)) return ing;
      const src = byId.get(ing.productId);
      if (!src) return ing;
      return { ...ing, name: src.name, servingLabel: src.servingLabel, facts: src.facts };
    }),
  };
}

/** Facts equal on every field, treating null/undefined as the same absence. */
function sameFacts(a: NutritionFacts, b: NutritionFacts): boolean {
  const near = (x: number, y: number) => Math.abs(x - y) < 0.05;
  const opt = (x: number | null | undefined, y: number | null | undefined) => {
    const xa = x == null, ya = y == null;
    if (xa || ya) return xa && ya;
    return near(x as number, y as number);
  };
  return (
    near(a.kcal, b.kcal) &&
    near(a.protein, b.protein) &&
    near(a.carbs, b.carbs) &&
    near(a.fat, b.fat) &&
    opt(a.satFat, b.satFat) &&
    opt(a.sugar, b.sugar) &&
    opt(a.fiber, b.fiber) &&
    opt(a.salt, b.salt)
  );
}

/**
 * How much of the source went in, as a phrase.
 *
 * A single serving prints the label alone — "100 g", not "1 × 100 g", which
 * reads as a machine describing a quantity rather than a person writing down a
 * recipe. Anything else prints the multiplier, and the × is a genuine
 * multiplication sign (U+00D7), not the letter x.
 */
export function formatIngredientQty(ing: Pick<UserRecipeIngredient, "qty" | "servingLabel">): string {
  const q = Math.round(ing.qty * 100) / 100;
  if (Math.abs(q - 1) < 0.005) return ing.servingLabel;
  return `${q} × ${ing.servingLabel}`;
}

/** A blank recipe, for the "new recipe" form. */
export function emptyUserRecipe(): Omit<UserRecipe, "id"> {
  return { name: "", note: null, emoji: null, servings: 1, timeMins: null, ingredients: [] };
}

// ── SHARING YOUR OWN RECIPE ─────────────────────────────────────────────────

/** The labels `userRecipeShareView` needs. A user recipe has no METHOD — the
 *  model holds ingredients and quantities, not prose — so the renderer's method
 *  block simply stays empty rather than printing an empty heading. */
export interface UserRecipeShareLabels {
  mins: (n: number) => string;
  serves: (n: number) => string;
  /** The per-serving macro line, from the DERIVED totals. */
  macros: (f: NutritionFacts) => string;
  ingredientsHead: (serves: number) => string;
  credit: string;
}

/**
 * A dish the athlete authored, projected onto the shared share view.
 *
 * NO LINK, and that is the honest part: a private recipe has no public address,
 * so the message carries the recipe and stops. The macro line comes from
 * `recipeTotals` — the same derived per-serving figures the editor shows, never
 * a number typed for the occasion.
 */
export function userRecipeShareView(r: UserRecipe, t: UserRecipeShareLabels): RecipeShareView {
  const { perServing, servings } = recipeTotals(r);
  const meta = [t.serves(servings)];
  if (r.timeMins != null && r.timeMins > 0) meta.unshift(t.mins(r.timeMins));
  return {
    title: r.name,
    meta,
    macroLine: t.macros(perServing),
    ingredientsHead: t.ingredientsHead(servings),
    ingredients: r.ingredients
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((ing) => `${formatIngredientQty(ing)} ${ing.name}`),
    methodHead: "",
    steps: [],
    credit: t.credit,
  };
}

/** The shared message for a user recipe — the same renderer the library uses. */
export function userRecipeShareText(r: UserRecipe, t: UserRecipeShareLabels): string {
  return recipeShareText(userRecipeShareView(r, t));
}
