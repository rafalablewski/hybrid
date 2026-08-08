import { describe, it, expect } from "vitest";
import {
  RECIPES,
  RECIPE_TINT_COLOR,
  recipeCoverView,
  recipeById,
  filterRecipes,
  searchRecipes,
  recipeShelves,
  recipesInCollection,
  recipeLibraryCoverView,
  recipeCollectionCoverView,
  recipeTileView,
  recipeCardStats,
  recipeCookView,
  RECIPE_COLLECTIONS,
  RECIPE_COLLECTION_META,
  type Recipe,
  type RecipeMeal,
} from "./recipes";

/** The client-side chrome recipeCoverView() asks for, in English. */
const T = {
  meal: (m: RecipeMeal) => ({ breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" })[m],
  mins: (n: number) => `${n} min`,
  serves: (n: number) => `${n} serves`,
  ingredients: (n: number) => `${n} ingredients`,
  highProtein: "High protein",
  energy: "Energy",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
};

describe("recipe catalog", () => {
  it("gives every recipe a one-line note — the cover's blurb slot", () => {
    for (const r of RECIPES) {
      expect(r.note.length, `${r.id} has no note`).toBeGreaterThan(20);
      // One sentence, not a paragraph: it sits under the hem.
      expect(r.note.length, `${r.id}'s note is too long for the cover`).toBeLessThan(160);
    }
  });

  it("has a tint colour for every tint in use", () => {
    for (const r of RECIPES) expect(RECIPE_TINT_COLOR[r.tint]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("keeps ids unique — a duplicate would make recipeById ambiguous", () => {
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("recipeCoverView", () => {
  const ramen = recipeById("ramen") as Recipe;

  it("fills every cover slot from the recipe", () => {
    const c = recipeCoverView(ramen, T);
    expect(c.accent).toBe(RECIPE_TINT_COLOR.amber);
    expect(c.glyph).toBe(ramen.emoji);
    expect(c.chip).toBe("Lunch");
    expect(c.duration).toBe("15 MIN");
    expect(c.title).toBe("Ramen");
    expect(c.blurb).toBe(ramen.note);
    expect(c.variant).toBe("recipe");
  });

  it("carries FOUR hem columns — one per macro, per serve", () => {
    const c = recipeCoverView(ramen, T);
    expect(c.stats).toHaveLength(4);
    expect(c.stats.map((s) => s.label)).toEqual(["Energy", "Protein", "Carbs", "Fat"]);
    expect(c.stats[0]).toEqual({ value: "540", unit: null, label: "Energy" });
    // grams carry their unit; energy does not (the label says Energy, the
    // number is kcal — a "g" there would be a lie)
    expect(c.stats.slice(1).every((s) => s.unit === "g")).toBe(true);
  });

  it("only claims High protein when the recipe is flagged", () => {
    const withFlag = recipeCoverView(recipeById("power-salad") as Recipe, T);
    expect(withFlag.metaParts).toContain("High protein");
    expect(recipeCoverView(ramen, T).metaParts).not.toContain("High protein");
    // the null is dropped by the meta line, never rendered as a gap
    expect(recipeCoverView(ramen, T).metaParts.filter(Boolean)).toHaveLength(2);
  });

  it("states the serve count, because the hem is per-serve and the stepper moves", () => {
    const c = recipeCoverView(ramen, T);
    expect(c.metaParts[0]).toBe("2 serves");
    expect(c.metaParts[1]).toBe("8 ingredients");
  });

  it("builds a cover for every recipe in the library", () => {
    for (const r of RECIPES) {
      const c = recipeCoverView(r, T);
      expect(c.title).toBe(r.name);
      expect(c.blurb).toBeTruthy();
      expect(c.stats).toHaveLength(4);
      expect(c.metaParts.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("filterRecipes", () => {
  it("returns everything for 'all'", () => {
    expect(filterRecipes(RECIPES, "all")).toHaveLength(RECIPES.length);
  });
  it("filters by meal and by the high-protein flag", () => {
    expect(filterRecipes(RECIPES, "breakfast").every((r) => r.meal === "breakfast")).toBe(true);
    expect(filterRecipes(RECIPES, "highProtein").every((r) => r.highProtein)).toBe(true);
  });
});

describe("the recipes library — the Plans tab's three levels, on food", () => {
  const L = {
    chip: "Library",
    title: "Recipes",
    recipe: "recipe",
    recipes: "recipes",
  };
  const CT = {
    ...L,
    chip: "Recipes",
    title: "Breakfast",
    fastest: (n: number) => `From ${n} min`,
    upToProtein: (g: number) => `Up to ${g} g protein`,
  };

  it("puts every recipe on at least one shelf", () => {
    const shelved = new Set(recipeShelves().flatMap((s) => s.recipes.map((r) => r.id)));
    for (const r of RECIPES) expect(shelved.has(r.id), `${r.id} is on no shelf`).toBe(true);
  });

  it("never renders an empty shelf — a collection with nothing in it is dropped", () => {
    // nothing in the library is a snack today; the shelf must not appear
    expect(recipeShelves().map((s) => s.key)).not.toContain("snack");
    for (const s of recipeShelves()) expect(s.recipes.length).toBeGreaterThan(0);
  });

  it("keeps the collections in library order, cross-cut last", () => {
    expect(recipeShelves().map((s) => s.key)).toEqual(["breakfast", "lunch", "dinner", "highProtein"]);
  });

  it("searches what a cook types — the dish, what it is, and what's in it", () => {
    expect(searchRecipes(RECIPES, "avocado").map((r) => r.id)).toContain("avocado-toast");
    // an INGREDIENT that isn't in any name still finds its dish
    expect(searchRecipes(RECIPES, "lentils").map((r) => r.id)).toEqual(["lentil-stew"]);
    expect(searchRecipes(RECIPES, "  RAMEN ").map((r) => r.id)).toEqual(["ramen"]);
    expect(searchRecipes(RECIPES, "")).toHaveLength(RECIPES.length);
    expect(searchRecipes(RECIPES, "zzzz")).toEqual([]);
  });

  it("narrows the shelves by the search, dropping the ones left empty", () => {
    const shelves = recipeShelves("lentils");
    expect(shelves).toHaveLength(1);
    expect(shelves[0]!.key).toBe("dinner");
  });

  it("counts the library on its cover and lists what it holds", () => {
    const lib = recipeLibraryCoverView(RECIPES.length, ["Breakfast", "Lunch"], L);
    expect(lib.count).toBe(`${RECIPES.length} RECIPES`);
    expect(lib.metaParts).toEqual(["Breakfast", "Lunch"]);
    expect(lib.title).toBe("Recipes");
    // a geometric glyph, not an emoji: the library cover ghosts its mark to 9%
    // white, where a colour emoji is a grey smudge
    expect(lib.glyph).toBe("◉");
    expect(recipeLibraryCoverView(1, [], L).count).toBe("1 RECIPE");
  });

  it("gives a collection its own cover — a plate, with no aggregate hem", () => {
    const list = recipesInCollection("breakfast");
    const c = recipeCollectionCoverView("breakfast", list, CT);
    expect(c.title).toBe("Breakfast");
    expect(c.chip).toBe("Recipes");
    expect(c.count).toBe(`${list.length} RECIPES`);
    expect(c.variant).toBe("recipe");
    expect(c.blurb.length).toBeGreaterThan(20);
    // the numbers on the cover are the shelf's EXTREMES, not averages
    expect(c.metaParts).toEqual(["From 5 min", "Up to 22 g protein"]);
  });

  it("has cover art and a blurb for every collection, including the empty one", () => {
    for (const key of RECIPE_COLLECTIONS) {
      const meta = RECIPE_COLLECTION_META[key];
      expect(meta.glyph).toBeTruthy();
      expect(meta.note.length).toBeGreaterThan(20);
      expect(RECIPE_TINT_COLOR[meta.tint]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // an empty collection still builds a cover — it just has no meta to state
    expect(recipeCollectionCoverView("snack", [], { ...CT, title: "Snacks" }).metaParts).toEqual([]);
  });

  it("shrinks a recipe to a tile without losing its numbers", () => {
    const tile = recipeTileView(recipeById("ramen") as Recipe, { mins: (n) => `${n} min`, kcal: (n) => `${n} kcal` });
    expect(tile).toEqual({ accent: RECIPE_TINT_COLOR.amber, glyph: "🍜", title: "Ramen", count: "15 MIN", meta: "540 kcal" });
  });

  it("gives a recipe card the three numbers that separate it from its neighbours", () => {
    const stats = recipeCardStats(recipeById("power-salad") as Recipe, { energy: "Energy", protein: "Protein", time: "Time", min: "min" });
    expect(stats).toEqual([
      { value: "380", unit: null, label: "Energy" },
      { value: "32", unit: "g", label: "Protein" },
      { value: "10", unit: "min", label: "Time" },
    ]);
  });
});

describe("recipeCookView — the plate the cook screen wears", () => {
  const CK = {
    meal: (m: RecipeMeal) => ({ breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" })[m],
    stepXofY: (x: number, y: number) => `Step ${x} of ${y}`,
  };
  const ramen = recipeById("ramen") as Recipe;

  it("wears the recipe's own cover slots, with the counter where time sits", () => {
    const c = recipeCookView(ramen, 1, CK);
    expect(c.accent).toBe(RECIPE_TINT_COLOR.amber);
    expect(c.glyph).toBe("🍜");
    expect(c.chip).toBe("Lunch");
    expect(c.title).toBe("Ramen");
    expect(c.count).toBe("STEP 2 OF 5");
    expect(c.step).toBe(ramen.steps[1]);
    expect(c.last).toBe(false);
  });

  it("clamps a step index that has run past either end", () => {
    expect(recipeCookView(ramen, -3, CK).index).toBe(0);
    expect(recipeCookView(ramen, 99, CK).index).toBe(ramen.steps.length - 1);
    // clamping to the end also means the CTA finishes rather than advancing
    expect(recipeCookView(ramen, 99, CK).last).toBe(true);
  });

  it("marks the last step for every recipe, so the CTA can never advance off the end", () => {
    for (const r of RECIPES) {
      expect(recipeCookView(r, r.steps.length - 1, CK).last).toBe(true);
      expect(recipeCookView(r, 0, CK).steps).toBe(r.steps.length);
      expect(recipeCookView(r, 0, CK).last).toBe(r.steps.length === 1);
    }
  });
});
