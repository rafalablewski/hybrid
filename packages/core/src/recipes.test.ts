import { describe, it, expect } from "vitest";
import {
  RECIPES,
  RECIPE_TINT_COLOR,
  recipeCoverView,
  recipeById,
  filterRecipes,
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
