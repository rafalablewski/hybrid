/**
 * Recipes — a small, curated, READ-ONLY library (the "static library" scope).
 *
 * Shared by both clients (web + mobile) so the browse grid, the detail screen
 * and the cook-along step-through show identical data. There is no recipes
 * database and no DB write here: a recipe is viewed, its ingredients scale with
 * the serving stepper, and the cook flow steps through its method. Logging a
 * cooked recipe into the day is a separate, planned capability
 * (see capabilities.ts `recipe-cook-log`).
 *
 * Content (names, ingredients, method) is plain text — the same convention as
 * the exercise library — while the surrounding UI chrome is localized through
 * t(). Macros are PER SERVE and single-number (the app's no-range rule);
 * ingredient quantities are stored for `baseServes` and scale linearly.
 */

export type RecipeMeal = "breakfast" | "lunch" | "dinner" | "snack";

/** Hero tint — recipes have no photo assets, so the hero is a warm gradient
 *  keyed to one of the brand accents plus the dish emoji. Keeps the library
 *  self-contained (no external images) and on-system. */
export type RecipeTint = "amber" | "blue" | "red" | "lime";

export interface RecipeIngredient {
  name: string;
  /** quantity for `baseServes` servings; scales linearly with the stepper */
  qty: number;
  /** unit shown after the quantity, e.g. "g", "ml", "tbsp", "" (for "2 eggs") */
  unit: string;
  /** optional garnish/extra — rendered muted, like the mock's greyed row */
  optional?: boolean;
}

export interface RecipeStep {
  text: string;
  /** optional per-step timer in seconds — surfaced as a tappable chip */
  timerSec?: number;
}

/** Per-serve macros — the numbers behind the recipe macro strip. */
export interface RecipeMacros {
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
}

export interface Recipe {
  id: string;
  name: string;
  meal: RecipeMeal;
  /** total active time in minutes */
  timeMins: number;
  emoji: string;
  tint: RecipeTint;
  /** the serving count the stored quantities + macros describe */
  baseServes: number;
  /** PER-SERVE macros (constant as serves changes) */
  macros: RecipeMacros;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  /** true = protein-forward; powers the "High protein" filter chip */
  highProtein?: boolean;
}

export const RECIPES: Recipe[] = [
  {
    id: "ramen",
    name: "Ramen",
    meal: "lunch",
    timeMins: 15,
    emoji: "🍜",
    tint: "amber",
    baseServes: 2,
    macros: { kcal: 540, protein: 15, carbs: 58, fat: 20 },
    ingredients: [
      { name: "Chicken breasts", qty: 250, unit: "g" },
      { name: "Unsalted butter", qty: 1, unit: "tbsp" },
      { name: "Sesame or vegetable oil", qty: 2, unit: "tsp" },
      { name: "Fresh ginger", qty: 2, unit: "tsp" },
      { name: "Ramen noodles", qty: 180, unit: "g" },
      { name: "Chicken stock", qty: 700, unit: "ml" },
      { name: "Large eggs", qty: 2, unit: "", optional: true },
      { name: "Spring onion", qty: 2, unit: "", optional: true },
    ],
    steps: [
      { text: "Slice the chicken thin and season with salt. Bring the stock to a gentle simmer with the ginger." },
      { text: "Boil the noodles in a separate pot until just tender, then drain.", timerSec: 240 },
      { text: "Sear the chicken in the oil and butter over high heat until golden and cooked through.", timerSec: 300 },
      { text: "Soft-boil the eggs for 6.5 minutes, then peel and halve.", timerSec: 390 },
      { text: "Divide noodles between bowls, ladle over the broth, and top with chicken, egg and spring onion." },
    ],
  },
  {
    id: "power-salad",
    name: "Power Salad",
    meal: "lunch",
    timeMins: 10,
    emoji: "🥗",
    tint: "blue",
    baseServes: 1,
    macros: { kcal: 380, protein: 32, carbs: 20, fat: 18 },
    highProtein: true,
    ingredients: [
      { name: "Grilled chicken", qty: 120, unit: "g" },
      { name: "Mixed greens", qty: 80, unit: "g" },
      { name: "Cherry tomatoes", qty: 60, unit: "g" },
      { name: "Avocado", qty: 50, unit: "g" },
      { name: "Olive oil", qty: 1, unit: "tbsp" },
      { name: "Lemon juice", qty: 1, unit: "tbsp" },
      { name: "Feta", qty: 30, unit: "g", optional: true },
    ],
    steps: [
      { text: "Whisk the olive oil and lemon juice with a pinch of salt and pepper." },
      { text: "Toss the greens and tomatoes with the dressing until lightly coated." },
      { text: "Slice the chicken and avocado over the top, then crumble on the feta." },
    ],
  },
  {
    id: "shakshuka",
    name: "Shakshuka",
    meal: "breakfast",
    timeMins: 20,
    emoji: "🍳",
    tint: "red",
    baseServes: 2,
    macros: { kcal: 410, protein: 22, carbs: 24, fat: 26 },
    highProtein: true,
    ingredients: [
      { name: "Large eggs", qty: 4, unit: "" },
      { name: "Chopped tomatoes", qty: 400, unit: "g" },
      { name: "Onion", qty: 1, unit: "" },
      { name: "Red pepper", qty: 1, unit: "" },
      { name: "Olive oil", qty: 2, unit: "tbsp" },
      { name: "Smoked paprika", qty: 1, unit: "tsp" },
      { name: "Feta", qty: 40, unit: "g", optional: true },
    ],
    steps: [
      { text: "Soften the diced onion and pepper in the olive oil until sweet.", timerSec: 480 },
      { text: "Stir in the paprika and tomatoes and simmer until thick and jammy.", timerSec: 600 },
      { text: "Make wells in the sauce and crack in the eggs. Cover and cook to your liking.", timerSec: 420 },
      { text: "Crumble over the feta and finish with fresh herbs." },
    ],
  },
  {
    id: "avocado-toast",
    name: "Avocado Toast",
    meal: "breakfast",
    timeMins: 8,
    emoji: "🥑",
    tint: "lime",
    baseServes: 1,
    macros: { kcal: 320, protein: 12, carbs: 34, fat: 16 },
    ingredients: [
      { name: "Sourdough", qty: 2, unit: "slices" },
      { name: "Avocado", qty: 100, unit: "g" },
      { name: "Large egg", qty: 1, unit: "" },
      { name: "Lemon juice", qty: 1, unit: "tsp" },
      { name: "Chilli flakes", qty: 1, unit: "pinch", optional: true },
    ],
    steps: [
      { text: "Toast the sourdough until deep and crisp." },
      { text: "Mash the avocado with the lemon juice, salt and pepper." },
      { text: "Poach or fry the egg, spread the avocado on the toast, and slide the egg on top." },
    ],
  },
  {
    id: "chicken-wrap",
    name: "Chicken Wrap",
    meal: "dinner",
    timeMins: 18,
    emoji: "🌯",
    tint: "red",
    baseServes: 2,
    macros: { kcal: 560, protein: 40, carbs: 48, fat: 22 },
    highProtein: true,
    ingredients: [
      { name: "Chicken thighs", qty: 300, unit: "g" },
      { name: "Tortilla wraps", qty: 2, unit: "" },
      { name: "Greek yoghurt", qty: 80, unit: "g" },
      { name: "Cos lettuce", qty: 60, unit: "g" },
      { name: "Olive oil", qty: 1, unit: "tbsp" },
      { name: "Ground cumin", qty: 1, unit: "tsp" },
      { name: "Hot sauce", qty: 1, unit: "tbsp", optional: true },
    ],
    steps: [
      { text: "Toss the chicken with the cumin, oil and salt." },
      { text: "Sear over high heat until charred and cooked through, then rest and slice.", timerSec: 480 },
      { text: "Warm the tortillas, spread with yoghurt, and fill with lettuce and chicken." },
      { text: "Add hot sauce, roll tightly, and halve on the diagonal." },
    ],
  },
  {
    id: "lentil-stew",
    name: "Lentil Stew",
    meal: "dinner",
    timeMins: 30,
    emoji: "🍲",
    tint: "amber",
    baseServes: 4,
    macros: { kcal: 470, protein: 24, carbs: 62, fat: 12 },
    ingredients: [
      { name: "Dried red lentils", qty: 250, unit: "g" },
      { name: "Vegetable stock", qty: 900, unit: "ml" },
      { name: "Carrots", qty: 2, unit: "" },
      { name: "Onion", qty: 1, unit: "" },
      { name: "Chopped tomatoes", qty: 400, unit: "g" },
      { name: "Ground cumin", qty: 2, unit: "tsp" },
      { name: "Spinach", qty: 100, unit: "g", optional: true },
    ],
    steps: [
      { text: "Soften the diced onion and carrot in a splash of oil.", timerSec: 480 },
      { text: "Stir in the cumin, then the lentils, tomatoes and stock." },
      { text: "Simmer until the lentils are soft and the stew has thickened.", timerSec: 1200 },
      { text: "Wilt in the spinach and season to taste." },
    ],
  },
  {
    id: "overnight-oats",
    name: "Overnight Oats",
    meal: "breakfast",
    timeMins: 5,
    emoji: "🥣",
    tint: "lime",
    baseServes: 1,
    macros: { kcal: 350, protein: 20, carbs: 48, fat: 9 },
    highProtein: true,
    ingredients: [
      { name: "Rolled oats", qty: 60, unit: "g" },
      { name: "Milk", qty: 180, unit: "ml" },
      { name: "Greek yoghurt", qty: 60, unit: "g" },
      { name: "Whey protein", qty: 15, unit: "g" },
      { name: "Berries", qty: 60, unit: "g", optional: true },
      { name: "Honey", qty: 1, unit: "tsp", optional: true },
    ],
    steps: [
      { text: "Stir the oats, milk, yoghurt and protein together in a jar." },
      { text: "Seal and refrigerate overnight so the oats soften." },
      { text: "Top with berries and a drizzle of honey before eating." },
    ],
  },
  {
    id: "salmon-bowl",
    name: "Salmon Rice Bowl",
    meal: "dinner",
    timeMins: 22,
    emoji: "🍚",
    tint: "blue",
    baseServes: 2,
    macros: { kcal: 620, protein: 38, carbs: 60, fat: 24 },
    highProtein: true,
    ingredients: [
      { name: "Salmon fillets", qty: 300, unit: "g" },
      { name: "Sushi rice", qty: 160, unit: "g" },
      { name: "Cucumber", qty: 1, unit: "" },
      { name: "Edamame", qty: 100, unit: "g" },
      { name: "Soy sauce", qty: 2, unit: "tbsp" },
      { name: "Sesame oil", qty: 1, unit: "tsp" },
      { name: "Avocado", qty: 60, unit: "g", optional: true },
    ],
    steps: [
      { text: "Rinse and cook the rice, then let it steam off the heat.", timerSec: 900 },
      { text: "Roast or pan-sear the salmon until just flaking.", timerSec: 600 },
      { text: "Slice the cucumber and avocado; whisk the soy and sesame oil into a dressing." },
      { text: "Build the bowls with rice, salmon, edamame and vegetables, then spoon over the dressing." },
    ],
  },
];

/** Filter categories for the browse chips — "all" + the meals + high-protein. */
export type RecipeFilter = "all" | RecipeMeal | "highProtein";
export const RECIPE_FILTERS: RecipeFilter[] = ["all", "breakfast", "lunch", "dinner", "highProtein"];

export function filterRecipes(recipes: Recipe[], filter: RecipeFilter): Recipe[] {
  if (filter === "all") return recipes;
  if (filter === "highProtein") return recipes.filter((r) => r.highProtein);
  return recipes.filter((r) => r.meal === filter);
}

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

/** Scale one ingredient's quantity from `baseServes` to the chosen serves.
 *  Rounded to a clean, kitchen-readable number (whole for ≥10, else 1 dp). */
export function scaleIngredientQty(qty: number, baseServes: number, serves: number): number {
  if (baseServes <= 0) return qty;
  const scaled = (qty / baseServes) * serves;
  return scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
}

/** Format a (possibly scaled) quantity, dropping a trailing ".0". */
export function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(1).replace(/\.0$/, "");
}

/** An ingredient's amount as shown on the row, e.g. "375 g" or "3 eggs". */
export function formatIngredient(ing: RecipeIngredient, baseServes: number, serves: number): string {
  const q = formatQty(scaleIngredientQty(ing.qty, baseServes, serves));
  return ing.unit ? `${q} ${ing.unit}` : q;
}

/** Whole-recipe macros at a given serves count (per-serve × serves) — for a
 *  future "log this cooked recipe" action; the detail strip shows per-serve. */
export function recipeMacrosForServes(recipe: Recipe, serves: number): RecipeMacros {
  const s = Math.max(1, serves);
  return {
    kcal: Math.round(recipe.macros.kcal * s),
    protein: Math.round(recipe.macros.protein * s),
    carbs: Math.round(recipe.macros.carbs * s),
    fat: Math.round(recipe.macros.fat * s),
  };
}

/** A saveable meal draft (name + emoji + single-number macros) — the shape the
 *  SavedMeal library POST accepts. */
export interface RecipeMealDraft {
  name: string;
  emoji: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Turn a recipe into a personal-library meal ("Create meal" from a recipe). A
 *  saved meal logs as ONE serving, so the draft carries the recipe's PER-SERVE
 *  macros (the same numbers the detail macro strip shows) under the recipe name
 *  + dish emoji. Both clients POST this to /api/nutrition/meals. */
export function recipeToMeal(recipe: Recipe): RecipeMealDraft {
  return {
    name: recipe.name,
    emoji: recipe.emoji,
    kcal: recipe.macros.kcal,
    protein: recipe.macros.protein,
    carbs: recipe.macros.carbs,
    fat: recipe.macros.fat,
  };
}
