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

import { colors } from "./theme/tokens";

import { glyphMark, type Mark } from "./theme/mark";
import type { BrandAccent } from "./semantic";

export type RecipeMeal = "breakfast" | "lunch" | "dinner" | "snack";

/** Hero tint — recipes have no photo assets, so the hero is a warm gradient
 *  keyed to one of the brand accents plus the dish mark. Keeps the library
 *  self-contained (no external images) and on-system. */
/** The four accents — see semantic.ts BrandAccent. */
export type RecipeTint = BrandAccent;

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
  /** ONE line saying what the dish actually is — the cover's blurb slot, the
   *  same job `GoalPlan.desc` does on a plan cover. Plain text like the rest of
   *  the recipe content (names, ingredients, method), not an i18n key. Keep it
   *  to a sentence: it sits under the hem, not in a description panel. */
  note: string;
  /** total active time in minutes */
  timeMins: number;
  /** The dish's drawing. Was an emoji; a `Mark` now, drawn from the nutrition
   *  glyphs by KIND (bowl / leaf / egg / grain / apple) rather than by dish —
   *  sport-marks.ts's rule, applied to food: there are not eight distinctive
   *  silhouettes between ramen and rice, and the title already says which. */
  mark: Mark;
  tint: RecipeTint;
  /** the serving count the stored quantities + macros describe */
  baseServes: number;
  /** PER-SERVE macros (constant as serves changes) */
  macros: RecipeMacros;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  // NO `highProtein` FIELD, deliberately — see `isHighProtein` below. It was a
  // hand-typed boolean, and two dishes with the same numbers ended up on
  // different shelves.
}

export const RECIPES: Recipe[] = [
  {
    id: "ramen",
    name: "Ramen",
    meal: "lunch",
    note: "A fast weeknight bowl — seared chicken and soft eggs in a gingered stock, built while the noodles boil.",
    timeMins: 15,
    mark: glyphMark("bowl"),
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
    note: "Chicken, feta and leaves dressed at the table, for when lunch has to be quick and still carry protein.",
    timeMins: 10,
    mark: glyphMark("leaf"),
    tint: "blue",
    baseServes: 1,
    macros: { kcal: 380, protein: 32, carbs: 20, fat: 18 },
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
    note: "Eggs poached straight into a spiced tomato and pepper base, cooked and served in one pan.",
    timeMins: 20,
    mark: glyphMark("egg"),
    tint: "red",
    baseServes: 2,
    macros: { kcal: 410, protein: 22, carbs: 24, fat: 26 },
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
    note: "The eight-minute breakfast, on sourdough, with enough salt and acid to stop it tasting flat.",
    timeMins: 8,
    mark: glyphMark("leaf"),
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
    note: "Paprika thighs, yoghurt and crunch rolled into a wrap — the highest-protein thing here that still eats like fast food.",
    timeMins: 18,
    mark: glyphMark("grain"),
    tint: "red",
    baseServes: 2,
    macros: { kcal: 560, protein: 40, carbs: 48, fat: 22 },
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
    note: "A pot of green lentils and root vegetables that gets better on day two, so it doubles as the week's lunches.",
    timeMins: 30,
    mark: glyphMark("bowl"),
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
    note: "Assembled the night before and eaten cold, with whey and berries doing the work while you sleep.",
    timeMins: 5,
    mark: glyphMark("grain"),
    tint: "lime",
    baseServes: 1,
    macros: { kcal: 350, protein: 20, carbs: 48, fat: 9 },
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
    note: "Roast salmon over seasoned rice with edamame and cucumber — the biggest plate in the library, and the one to eat after a hard session.",
    timeMins: 22,
    mark: glyphMark("grain"),
    tint: "blue",
    baseServes: 2,
    macros: { kcal: 620, protein: 38, carbs: 60, fat: 24 },
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
/**
 * IS THIS A HIGH-PROTEIN DISH? Derived from the recipe's own numbers.
 *
 * It used to be a hand-typed `highProtein: true` on each entry, and the library
 * had grown the failure that invites: lentil stew (24 g, 20% of its energy) sat
 * OFF the shelf while shakshuka (22 g, 21%) sat on it. Two dishes, the same
 * numbers, different shelves, and nothing in the file could tell you why —
 * which makes the shelf a matter of who typed the entry rather than what is in
 * the bowl.
 *
 * The doctrine is the PANTRY'S, applied to a dish: a food's shelf comes from
 * its own numbers (pantry.ts `foodRole`, which files an egg by where the energy
 * in it actually is). Two terms, because either alone misfiles something real:
 *
 *   • GRAMS, because a 220 kcal snack that is 40% protein carries 22 g and is
 *     genuinely a protein dish, while a share test alone would also admit a
 *     90 kcal one carrying nine;
 *   • SHARE of energy, at 4 kcal/g on the protein itself (never the stated
 *     kcal, which carries fibre and rounding no macro accounts for), because a
 *     620 kcal bowl with 25 g of protein is a big meal that happens to contain
 *     some, not a protein dish.
 *
 * On the shipped library the rule keeps all five dishes the flag had, and adds
 * the lentil stew — the one the numbers always said belonged there.
 */
export const HIGH_PROTEIN_MIN_G = 20;
export const HIGH_PROTEIN_MIN_SHARE = 0.2;

export function isHighProtein(recipe: Recipe): boolean {
  const { protein, kcal } = recipe.macros;
  if (protein < HIGH_PROTEIN_MIN_G || kcal <= 0) return false;
  return (protein * 4) / kcal >= HIGH_PROTEIN_MIN_SHARE;
}

export type RecipeFilter = "all" | RecipeMeal | "highProtein";
export const RECIPE_FILTERS: RecipeFilter[] = ["all", "breakfast", "lunch", "dinner", "highProtein"];

export function filterRecipes(recipes: Recipe[], filter: RecipeFilter): Recipe[] {
  if (filter === "all") return recipes;
  if (filter === "highProtein") return recipes.filter(isHighProtein);
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

// ── The recipe COVER ────────────────────────────────────────────────────────

/** The tint as a real accent colour, so the cover's duotone wash is driven by
 *  the same hex on both clients (the gradient stops are mixed from it). */
export const RECIPE_TINT_COLOR: Record<RecipeTint, string> = {
  amber: colors.amber,
  blue: colors.blue,
  red: colors.red,
  lime: colors.lime,
};

/** What a cover scaffold needs to draw. Structurally the same subset the plan
 *  cover uses (see plan-program.ts `planCoverView`), so the recipe detail rides
 *  the EXACT scaffold the plan detail does rather than a lookalike. */
export interface RecipeCoverView {
  accent: string;
  /** the dish's drawn mark — cover art (see the `recipe` variant) */
  mark: Mark;
  chip: string;
  duration: string;
  title: string;
  metaParts: (string | null)[];
  stats: { value: string; unit: string | null; label: string }[];
  blurb: string;
  variant: "recipe";
}

/**
 * The recipe detail's cover — one shared view-model, so web and mobile can't
 * drift and neither can re-decide what belongs on it.
 *
 * FOUR hem columns, not the plan's three: a recipe's headline numbers are its
 * four macros, and dropping one to fit a borrowed grid would be the layout
 * choosing what the athlete gets to see. They are PER SERVE and stay per serve
 * as the stepper moves (that is what `macros` means here), which is why the
 * serve count is stated on the meta line rather than implied by the hem.
 *
 * `chip`/`duration`/labels are CALLER-LOCALIZED: the meal name and the "min" /
 * "serves" / macro labels are UI chrome that must speak the athlete's language,
 * while the recipe's own content (name, note) is plain text like the rest of
 * the library. Pass `t` from the client.
 */
export function recipeCoverView(
  recipe: Recipe,
  t: {
    meal: (meal: RecipeMeal) => string;
    mins: (n: number) => string;
    serves: (n: number) => string;
    ingredients: (n: number) => string;
    highProtein: string;
    energy: string;
    protein: string;
    carbs: string;
    fat: string;
  },
): RecipeCoverView {
  return {
    accent: RECIPE_TINT_COLOR[recipe.tint],
    mark: recipe.mark,
    chip: t.meal(recipe.meal),
    duration: t.mins(recipe.timeMins).toUpperCase(),
    title: recipe.name,
    metaParts: [
      t.serves(recipe.baseServes),
      t.ingredients(recipe.ingredients.length),
      isHighProtein(recipe) ? t.highProtein : null,
    ],
    stats: [
      { value: String(recipe.macros.kcal), unit: null, label: t.energy },
      { value: String(recipe.macros.protein), unit: "g", label: t.protein },
      { value: String(recipe.macros.carbs), unit: "g", label: t.carbs },
      { value: String(recipe.macros.fat), unit: "g", label: t.fat },
    ],
    blurb: recipe.note,
    variant: "recipe",
  };
}

// ── The recipes LIBRARY — collections, shelves, and the two covers above the
//    recipe ────────────────────────────────────────────────────────────────
//
// The library is shaped exactly like the Plans tab, because it is the same
// object: a shelf of covers you browse, a collection you open, a thing you
// commit to and then follow. Plans is library → goal → plan; recipes is
// library → collection → recipe, and all three levels ride the SAME cover
// scaffold (plan-program.ts libraryCoverView / goalCoverView ↔ the views
// below), so neither client re-decides what a level looks like.

/** A browsable collection — the meals, plus the one cross-cut the library
 *  keeps ("high protein"). The same job a goal category does for plans. A
 *  recipe can sit on two shelves (its meal and, if it qualifies, high
 *  protein): the cross-cut is an editorial shelf, not a taxonomy. */
export type RecipeCollection = RecipeMeal | "highProtein";

export const RECIPE_COLLECTIONS: RecipeCollection[] = ["breakfast", "lunch", "dinner", "snack", "highProtein"];

/** A collection's cover art + its one-line blurb. Plain text like the rest of
 *  the recipe content (names, ingredients, method); only the chrome around it
 *  (the title, the counts, the meta labels) is localized by the caller. */
export const RECIPE_COLLECTION_META: Record<RecipeCollection, { tint: RecipeTint; mark: Mark; note: string }> = {
  breakfast: { tint: "lime", mark: glyphMark("egg"), note: "The meals that decide how the rest of the day eats — quick, protein-forward, and mostly assembled rather than cooked." },
  lunch: { tint: "amber", mark: glyphMark("leaf"), note: "Built around a working day: everything here is on the table inside twenty minutes and travels in a box." },
  dinner: { tint: "blue", mark: glyphMark("bowl"), note: "The bigger plate at the end of the day, sized to refill what a hard session emptied." },
  snack: { tint: "red", mark: glyphMark("apple"), note: "Small, deliberate, and worth logging — the gap-fillers between the three plates." },
  highProtein: { tint: "red", mark: glyphMark("egg"), note: "Every dish in the library that carries real protein, wherever in the day it lands." },
};

/** The recipes on one shelf, in library order. */
export function recipesInCollection(key: RecipeCollection, recipes: Recipe[] = RECIPES): Recipe[] {
  return key === "highProtein" ? recipes.filter(isHighProtein) : recipes.filter((r) => r.meal === key);
}

/** Free-text search over what a cook would actually type — the dish, what it
 *  is, and what's IN it (searching "avocado" has to find the toast). */
export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  const q = query.trim().toLowerCase();
  if (!q) return recipes;
  return recipes.filter((r) =>
    r.name.toLowerCase().includes(q) ||
    r.note.toLowerCase().includes(q) ||
    r.ingredients.some((i) => i.name.toLowerCase().includes(q)),
  );
}

export interface RecipeShelf {
  key: RecipeCollection;
  recipes: Recipe[];
}

/** One shelf per non-empty collection — the library root's whole body. Empty
 *  collections are dropped rather than rendered as an empty rail (the same
 *  reason the plan shelves never print "0 plans"). */
export function recipeShelves(query = "", recipes: Recipe[] = RECIPES): RecipeShelf[] {
  const matched = searchRecipes(recipes, query);
  return RECIPE_COLLECTIONS
    .map((key) => ({ key, recipes: recipesInCollection(key, matched) }))
    .filter((s) => s.recipes.length > 0);
}

/** The LIBRARY-level cover — "Recipes" itself, the level above the
 *  collections. Structurally the Plans root's cover (plan-program.ts
 *  `libraryCoverView`) so the two roots are one object: a geometric emblem, the
 *  level named in the chip, the count top-right, the collections on the meta
 *  line. `◉` is a plate seen from above — the same geometric family as Plans'
 *  `◈`, and not it. This one is TYPE, not a picture: the library roots wear an
 *  abstract emblem where a recipe wears its dish mark. */
export interface RecipeLibraryCoverView {
  glyph: string;
  chip: string;
  count: string;
  title: string;
  metaParts: (string | null)[];
}

export function recipeLibraryCoverView(
  recipeCount: number,
  collectionTitles: string[],
  labels: { chip: string; title: string; recipe: string; recipes: string },
): RecipeLibraryCoverView {
  return {
    glyph: "◉",
    chip: labels.chip,
    count: `${recipeCount} ${recipeCount === 1 ? labels.recipe : labels.recipes}`.toUpperCase(),
    title: labels.title,
    metaParts: collectionTitles,
  };
}

/** The COLLECTION-level cover — "Breakfast" as its own screen, the way a goal
 *  gets one in Plans. It rides the `recipe` (plate) variant rather than the
 *  goal's emblem: the cover art here is the collection's dish mark. NO
 *  aggregate hem, for the plan library's reason —
 *  macros averaged across a shelf say nothing; each recipe card carries its
 *  own numbers instead (`recipeCardStats`). */
export interface RecipeCollectionCoverView {
  accent: string;
  mark: Mark;
  chip: string;
  /** top-right label — "3 RECIPES". */
  count: string;
  title: string;
  metaParts: (string | null)[];
  blurb: string;
  variant: "recipe";
}

export function recipeCollectionCoverView(
  key: RecipeCollection,
  recipes: Recipe[],
  t: {
    chip: string;
    title: string;
    recipe: string;
    recipes: string;
    /** "From 5 min" — the quickest thing on the shelf. */
    fastest: (mins: number) => string;
    /** "Up to 40 g protein" — the biggest hit on the shelf. */
    upToProtein: (grams: number) => string;
  },
): RecipeCollectionCoverView {
  const meta = RECIPE_COLLECTION_META[key];
  const n = recipes.length;
  return {
    accent: RECIPE_TINT_COLOR[meta.tint],
    mark: meta.mark,
    chip: t.chip,
    count: `${n} ${n === 1 ? t.recipe : t.recipes}`.toUpperCase(),
    title: t.title,
    metaParts: n === 0 ? [] : [
      t.fastest(Math.min(...recipes.map((r) => r.timeMins))),
      t.upToProtein(Math.max(...recipes.map((r) => r.macros.protein))),
    ],
    blurb: meta.note,
    variant: "recipe",
  };
}

/** A recipe at TILE scale — the cover it expands into, shrunk. The dish mark is
 *  stroked in the tint (it is the dish, not a watermark), the time reads top-right the
 *  way a plan tile prints its plan count, and the energy sits under the name. */
export interface RecipeTileView {
  accent: string;
  mark: Mark;
  title: string;
  /** top-right mono label — "15 MIN". */
  count: string;
  /** the line under the name — "540 kcal". */
  meta: string;
  /**
   * The SECOND figure on that line — "22 g protein".
   *
   * A tile used to state time and energy only, on a screen whose own collection
   * rail offers HIGH PROTEIN as one of four shelves: the library could sort by
   * a number it never showed you. Protein is also the figure this app is about,
   * and the one a hybrid athlete scans a list of dishes for.
   */
  protein: string;
  /** Whether this dish claims the high-protein shelf, so the tile can mark the
   *  figure rather than making you open it to find out. */
  highProtein: boolean;
}

export function recipeTileView(
  recipe: Recipe,
  t: { mins: (n: number) => string; kcal: (n: number) => string; protein: (n: number) => string },
): RecipeTileView {
  return {
    accent: RECIPE_TINT_COLOR[recipe.tint],
    mark: recipe.mark,
    title: recipe.name,
    count: t.mins(recipe.timeMins).toUpperCase(),
    meta: t.kcal(recipe.macros.kcal),
    protein: t.protein(recipe.macros.protein),
    highProtein: isHighProtein(recipe),
  };
}

/** The three-column hem on a recipe CARD (the collection screen's list), the
 *  same rule-topped columns a plan card carries. Three, not the cover's four:
 *  a card is scanned against its neighbours, so it states what separates one
 *  dish from the next — how much food, how much protein, how long it takes. */
export function recipeCardStats(
  recipe: Recipe,
  t: { energy: string; protein: string; time: string; min: string },
): { value: string; unit: string | null; label: string }[] {
  return [
    { value: String(recipe.macros.kcal), unit: null, label: t.energy },
    { value: String(recipe.macros.protein), unit: "g", label: t.protein },
    { value: String(recipe.timeMins), unit: t.min, label: t.time },
  ];
}

/** The COOK screen's plate — the recipe cover at one more compression.
 *
 *  The cook flow is NOT a cover screen: it doesn't scroll, and it ends in a
 *  sticky action bar, so a collapsing full-bleed cover would promise a collapse
 *  that never comes. What it gets instead is the cover's MATERIAL at plate
 *  scale — the same wash accent, the same dish mark, the same chip
 *  and title — with the step counter in the slot the detail cover gives to
 *  time, and the method's steps as ticks along its bottom edge. One view-model
 *  so both clients count, clamp and label identically. */
export interface RecipeCookView {
  accent: string;
  mark: Mark;
  chip: string;
  title: string;
  /** top-right mono label — "STEP 2 OF 5". */
  count: string;
  /** clamped 0-based position, and the total — the clients draw one tick each. */
  index: number;
  steps: number;
  step: RecipeStep;
  /** true on the last step: the CTA finishes instead of advancing. */
  last: boolean;
}

export function recipeCookView(
  recipe: Recipe,
  stepIndex: number,
  t: { meal: (meal: RecipeMeal) => string; stepXofY: (x: number, y: number) => string },
): RecipeCookView {
  const steps = recipe.steps.length;
  const index = Math.min(Math.max(0, Math.trunc(stepIndex) || 0), Math.max(0, steps - 1));
  return {
    accent: RECIPE_TINT_COLOR[recipe.tint],
    mark: recipe.mark,
    chip: t.meal(recipe.meal),
    title: recipe.name,
    count: t.stepXofY(index + 1, steps).toUpperCase(),
    index,
    steps,
    step: recipe.steps[index] ?? { text: "" },
    last: index >= steps - 1,
  };
}

/** A saveable meal draft (name + single-number macros) — the shape the
 *  SavedMeal library POST accepts.
 *
 *  NO `emoji`. The draft used to seed the saved meal with the recipe's
 *  pictograph, which is how app-authored emoji got into the database and back
 *  out onto the library row. A saved meal draws the shared dish glyph. */
export interface RecipeMealDraft {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Turn a recipe into a personal-library meal ("Create meal" from a recipe). A
 *  saved meal logs as ONE serving, so the draft carries the recipe's PER-SERVE
 *  macros (the same numbers the detail macro strip shows)
 *  under the recipe name. Both clients POST this to /api/nutrition/meals. */
export function recipeToMeal(recipe: Recipe): RecipeMealDraft {
  return {
    name: recipe.name,
    kcal: recipe.macros.kcal,
    protein: recipe.macros.protein,
    carbs: recipe.macros.carbs,
    fat: recipe.macros.fat,
  };
}

// ── SHARING A RECIPE ────────────────────────────────────────────────────────

/**
 * The https address of a recipe. Deliberately the WEB form and not `hybrid://`:
 * a link is only worth sending if it opens for someone who has not installed
 * the app. The universal-link entitlement is what will make it open IN the app
 * (there is no apple-app-site-association in the repo yet, and no web client
 * behind hybrid.app since Aug 2026), so today it is provenance rather than a
 * door — which is exactly why the shared MESSAGE carries the recipe itself and
 * not just this line. Same shape as the verified-food page's link, so the two
 * cannot drift into two URL vocabularies.
 */
export const RECIPE_SHARE_BASE = "https://hybrid.app/app?s=nutrition";

/** A link to one library recipe. `?recipe=` is already read by the mobile
 *  Nutrition route, so this lands ON the dish the day links resolve. */
export const recipeShareLink = (id: string): string => `${RECIPE_SHARE_BASE}&recipe=${encodeURIComponent(id)}`;

/** A link to the library itself, for sharing the shelf rather than a dish. */
export const recipeLibraryShareLink = (): string => `${RECIPE_SHARE_BASE}&recipes=1`;

/**
 * WHAT GETS SHARED, as data — the one shape the message is rendered from.
 *
 * Both kinds of recipe project onto it (`recipeShareView` here for the curated
 * library, `userRecipeShareView` in user-recipes.ts for a dish the athlete
 * authored), so a shared recipe reads the same whoever wrote it, in one
 * translated renderer rather than two string builders drifting apart.
 *
 * Every line arrives ALREADY FORMATTED and already translated. This module
 * knows how to scale a quantity; it does not know how the athlete's language
 * writes "serves 4".
 */
export interface RecipeShareView {
  title: string;
  /** Meal, time, servings — whatever the source can honestly state. */
  meta: string[];
  /** The per-serving macro line, or "" where the numbers are not stated. */
  macroLine: string;
  /** "INGREDIENTS (2 SERVINGS)" and its lines, already scaled. */
  ingredientsHead: string;
  ingredients: string[];
  /** The method, if the recipe has one. A user recipe has none. */
  methodHead: string;
  steps: string[];
  /** The provenance foot: a wordmark line and the link. */
  credit: string;
  link?: string;
}

/**
 * The shared message. Plain text, because a share sheet's least common
 * denominator is a message body and a recipe is worth reading in one — the
 * recipient of a bare link today has no app and no web page to open it with.
 *
 * NO middot separators (house rule): the meta line joins on a spaced en dash.
 */
export function recipeShareText(v: RecipeShareView): string {
  const block = (head: string, lines: string[]) => (lines.length === 0 ? "" : `\n\n${head}\n${lines.join("\n")}`);
  const numbered = v.steps.map((s, i) => `${i + 1}. ${s}`);
  return (
    v.title +
    (v.meta.length > 0 ? `\n${v.meta.join(" – ")}` : "") +
    (v.macroLine ? `\n${v.macroLine}` : "") +
    block(v.ingredientsHead, v.ingredients) +
    block(v.methodHead, numbered) +
    `\n\n${v.credit}` +
    (v.link ? `\n${v.link}` : "")
  );
}

/** The labels the share view needs, injected so this stays translated without
 *  importing the dictionary. */
export interface RecipeShareLabels {
  meal: (meal: RecipeMeal) => string;
  mins: (n: number) => string;
  serves: (n: number) => string;
  /** "410 kcal, 22 g protein, 24 g carbs, 26 g fat per serving" */
  macros: (m: RecipeMacros) => string;
  /** "INGREDIENTS (2 SERVINGS)" */
  ingredientsHead: (serves: number) => string;
  methodHead: string;
  optional: string;
  credit: string;
}

/** A curated library recipe, projected for sharing at the serving count the
 *  athlete is looking at — set the stepper to 4 and the message says 8 eggs. */
export function recipeShareView(recipe: Recipe, serves: number, t: RecipeShareLabels): RecipeShareView {
  // A serves count that is not a real, positive number falls back to the
  // recipe's OWN yield rather than to 1: the message must describe a dish
  // somebody can cook, and "1 serving of a recipe written for 2" is a silent
  // halving of every quantity in it.
  const rounded = Math.round(serves);
  const n = Number.isFinite(rounded) && rounded > 0 ? rounded : recipe.baseServes;
  return {
    title: recipe.name,
    meta: [t.meal(recipe.meal), t.mins(recipe.timeMins), t.serves(n)],
    macroLine: t.macros(recipe.macros),
    ingredientsHead: t.ingredientsHead(n),
    ingredients: recipe.ingredients.map(
      (ing) => `${formatIngredient(ing, recipe.baseServes, n)} ${ing.name}${ing.optional ? ` (${t.optional})` : ""}`,
    ),
    methodHead: t.methodHead,
    steps: recipe.steps.map((s) => s.text),
    credit: t.credit,
    link: recipeShareLink(recipe.id),
  };
}

// ── KEEPING A LIBRARY RECIPE ────────────────────────────────────────────────

/**
 * SAVED LIBRARY RECIPES — the athlete's own shelf of the curated ones.
 *
 * This is a set of ids and nothing else, held on the device (the mobile store
 * mirrors the saved-posts idiom: AsyncStorage is what the UI reads, so a star
 * fills on the press frame and the shelf opens offline).
 *
 * IT IS DELIBERATELY NOT A COPY INTO `UserRecipe`, and the reason is a fact
 * about the model rather than a preference. A user recipe's macros are DERIVED
 * from each ingredient's own snapshot (user-recipes.ts), and `NutritionFacts`
 * states kcal/protein/carbs/fat as REQUIRED numbers. A curated recipe carries
 * per-SERVE macros an editor typed and no per-ingredient figures at all, so a
 * copy could only fill those lines with zeros — a recipe reading "0 kcal" out
 * of seven real ingredients, which is precisely the confident-wrong-number
 * failure the derived-macros rule exists to prevent. Matching each line to a
 * food that does state its numbers is the importer-shaped problem; it is
 * recorded as `recipe-copy-to-mine` in capabilities.ts rather than faked here.
 */
export const RECIPE_SAVED_STORAGE_KEY = "hybrid.nutrition.savedRecipes.v1";

/** Read a persisted blob into a clean id list: strings only, deduped, and
 *  PRUNED to recipes that still exist — an id from an older build must leave a
 *  shorter shelf, never a blank row. Order is the athlete's save order. */
export function normalizeSavedRecipes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(RECIPES.map((r) => r.id));
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !known.has(v) || out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

/** Save or unsave, newest FIRST — the shelf reads as "what I just kept". */
export function toggleSavedRecipe(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids];
}

/** The saved ids as recipes, in save order, skipping any that no longer exist. */
export function savedRecipes(ids: string[]): Recipe[] {
  return normalizeSavedRecipes(ids)
    .map((id) => recipeById(id))
    .filter((r): r is Recipe => r != null);
}
