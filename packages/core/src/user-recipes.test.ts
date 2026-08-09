import { describe, expect, it } from "vitest";
import {
  MAX_RECIPE_SERVINGS,
  emptyUserRecipe,
  formatIngredientQty,
  ingredientFacts,
  recipeServings,
  recipeToLog,
  recipeTotals,
  refreshIngredients,
  scaleRecipeTo,
  staleIngredients,
  type UserRecipe,
  type UserRecipeIngredient,
} from "./user-recipes";
import type { NutritionFacts } from "./food-facts";

const facts = (f: Partial<NutritionFacts> & Pick<NutritionFacts, "kcal">): NutritionFacts => ({
  protein: 0, carbs: 0, fat: 0, ...f,
});

const ing = (
  id: string,
  name: string,
  qty: number,
  f: NutritionFacts,
  extra: Partial<UserRecipeIngredient> = {},
): UserRecipeIngredient => ({ id, name, qty, servingLabel: "100 g", facts: f, position: 0, ...extra });

// Chicken pasta, from the brief — 250 g chicken, 100 g pasta, 150 g sauce.
const pasta = (): UserRecipe => ({
  id: "r1",
  name: "Chicken pasta",
  servings: 2,
  ingredients: [
    ing("i1", "Chicken breast", 2.5, facts({ kcal: 165, protein: 31, carbs: 0, fat: 3.6, satFat: 1, sugar: 0, fiber: 0, salt: 0.1 })),
    ing("i2", "Pasta", 1, facts({ kcal: 350, protein: 12, carbs: 71, fat: 1.5, satFat: 0.3, sugar: 2.7, fiber: 3, salt: 0 })),
    ing("i3", "Tomato sauce", 1.5, facts({ kcal: 60, protein: 2, carbs: 8, fat: 2, satFat: 0.3, sugar: 6, fiber: 1.5, salt: 0.6 })),
  ],
});

describe("recipeServings", () => {
  it("is always a whole number of at least one", () => {
    expect(recipeServings({ servings: 0 })).toBe(1);
    expect(recipeServings({ servings: -3 })).toBe(1);
    expect(recipeServings({ servings: 2.4 })).toBe(2);
    expect(recipeServings({ servings: Number.NaN })).toBe(1);
  });

  it("clamps a runaway batch", () => {
    expect(recipeServings({ servings: 9_000 })).toBe(MAX_RECIPE_SERVINGS);
  });
});

describe("ingredientFacts", () => {
  it("scales the snapshot by what went in", () => {
    const f = ingredientFacts(ing("i", "Chicken", 2.5, facts({ kcal: 165, protein: 31, fat: 3.6 })));
    expect(f.kcal).toBe(413); // 165 × 2.5 = 412.5 → 413
    expect(f.protein).toBe(77.5);
  });

  it("keeps an unstated field unstated at any quantity", () => {
    const f = ingredientFacts(ing("i", "Mystery", 3, facts({ kcal: 100, sugar: null })));
    expect(f.sugar).toBeNull();
  });
});

describe("recipeTotals", () => {
  it("derives the whole recipe from its ingredients", () => {
    const { total } = recipeTotals(pasta());
    // 165×2.5 + 350 + 60×1.5 = 412.5 + 350 + 90 = 852.5 → 853
    expect(total.kcal).toBe(853);
    // 31×2.5 + 12 + 2×1.5 = 77.5 + 12 + 3 = 92.5
    expect(total.protein).toBe(92.5);
  });

  it("divides per serving without inventing precision", () => {
    const { perServing, servings } = recipeTotals(pasta());
    expect(servings).toBe(2);
    expect(perServing.kcal).toBe(Math.round(853 / 2));
  });

  it("drops a panel field no ingredient can complete, and names it", () => {
    const r = pasta();
    // Only SUGAR goes unstated — the other three panel fields stay stated, so
    // the test proves the drop is per-field rather than all-or-nothing.
    r.ingredients[1]!.facts = facts({ kcal: 350, protein: 12, carbs: 71, fat: 1.5, satFat: 0.3, sugar: null, fiber: 3, salt: 0 });
    const { total, partial } = recipeTotals(r);
    expect(total.sugar).toBeNull();
    expect(partial).toContain("sugar");
    // The fields every ingredient DOES state survive.
    expect(total.salt).not.toBeNull();
  });

  it("totals an empty recipe to zero rather than throwing", () => {
    const { total, perServing, ingredientCount } = recipeTotals({ ...pasta(), ingredients: [] });
    expect(total.kcal).toBe(0);
    expect(perServing.kcal).toBe(0);
    expect(ingredientCount).toBe(0);
  });

  it("never divides by zero servings", () => {
    const { perServing } = recipeTotals({ ...pasta(), servings: 0 });
    expect(Number.isFinite(perServing.kcal)).toBe(true);
    expect(perServing.kcal).toBe(853); // clamped to one serving
  });
});

describe("recipeToLog", () => {
  it("logs per SINGLE serving with a separate quantity, so the diary can rescale it", () => {
    const draft = recipeToLog(pasta(), 2);
    expect(draft.qty).toBe(2);
    expect(draft.facts.kcal).toBe(Math.round(853 / 2));
    expect(draft.name).toBe("Chicken pasta");
  });

  it("says what a serving IS", () => {
    expect(recipeToLog(pasta()).subname).toBe("1 of 2");
  });

  it("defaults to one serving and refuses a nonsense quantity", () => {
    expect(recipeToLog(pasta()).qty).toBe(1);
    expect(recipeToLog(pasta(), 0).qty).toBe(1);
    expect(recipeToLog(pasta(), -4).qty).toBe(1);
  });
});

describe("scaleRecipeTo", () => {
  it("scales the ingredients, not just the yield", () => {
    const r = scaleRecipeTo(pasta(), 4);
    expect(r.servings).toBe(4);
    expect(r.ingredients[0]!.qty).toBe(5); // 2.5 → 5
    expect(r.ingredients[1]!.qty).toBe(2);
  });

  it("keeps the per-serving figure identical — that is the whole point", () => {
    const before = recipeTotals(pasta()).perServing.kcal;
    const after = recipeTotals(scaleRecipeTo(pasta(), 6)).perServing.kcal;
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1); // rounding only
  });

  it("returns the same recipe when nothing changes", () => {
    const r = pasta();
    expect(scaleRecipeTo(r, 2)).toBe(r);
  });

  it("rounds quantities to two decimals rather than repeating", () => {
    const r = scaleRecipeTo({ ...pasta(), servings: 3 }, 4);
    for (const i of r.ingredients) expect(i.qty).toBe(Math.round(i.qty * 100) / 100);
  });
});

describe("staleIngredients", () => {
  const sources = [
    { id: "p1", name: "Chicken breast", servingLabel: "100 g", facts: facts({ kcal: 165, protein: 31, fat: 3.6, satFat: 1, sugar: 0, fiber: 0, salt: 0.1 }) },
  ];

  const linked = (): UserRecipe => {
    const r = pasta();
    r.ingredients[0] = { ...r.ingredients[0]!, productId: "p1" };
    return r;
  };

  it("reports nothing when the snapshot still matches", () => {
    expect(staleIngredients(linked(), sources)).toEqual([]);
  });

  it("reports an ingredient whose product has since changed", () => {
    const moved = [{ ...sources[0]!, facts: facts({ kcal: 172, protein: 32, fat: 3.6, satFat: 1, sugar: 0, fiber: 0, salt: 0.1 }) }];
    const stale = staleIngredients(linked(), moved);
    expect(stale).toHaveLength(1);
    expect(stale[0]!.name).toBe("Chicken breast");
    expect(stale[0]!.current.kcal).toBe(172);
  });

  it("treats a DELETED product as orphaned, not stale", () => {
    expect(staleIngredients(linked(), [])).toEqual([]);
  });

  it("ignores ingredients that were never linked", () => {
    expect(staleIngredients(pasta(), sources)).toEqual([]);
  });

  it("does not confuse a stated zero with an unstated field", () => {
    const r = linked();
    r.ingredients[0] = { ...r.ingredients[0]!, facts: { ...r.ingredients[0]!.facts, sugar: null } };
    // The source states sugar: 0; the snapshot states nothing. Those differ.
    expect(staleIngredients(r, sources)).toHaveLength(1);
  });
});

describe("refreshIngredients", () => {
  const moved = [
    { id: "p1", name: "Chicken thigh", servingLabel: "100 g", facts: facts({ kcal: 209, protein: 26, fat: 11 }) },
  ];

  const linked = (): UserRecipe => {
    const r = pasta();
    r.ingredients[0] = { ...r.ingredients[0]!, productId: "p1" };
    return r;
  };

  it("adopts the current numbers, name and serving label", () => {
    const r = refreshIngredients(linked(), moved);
    expect(r.ingredients[0]!.facts.kcal).toBe(209);
    expect(r.ingredients[0]!.name).toBe("Chicken thigh");
    // The QUANTITY is the athlete's own decision and is never touched.
    expect(r.ingredients[0]!.qty).toBe(2.5);
  });

  it("refreshes only the named ingredients when asked", () => {
    const r = refreshIngredients(linked(), moved, ["nope"]);
    expect(r.ingredients[0]!.facts.kcal).toBe(165);
  });

  it("leaves unlinked and orphaned ingredients alone", () => {
    const r = refreshIngredients(linked(), []);
    expect(r.ingredients[0]!.facts.kcal).toBe(165);
    expect(r.ingredients[1]!.name).toBe("Pasta");
  });
});

describe("formatIngredientQty", () => {
  it("prints the label alone for a single serving", () => {
    expect(formatIngredientQty({ qty: 1, servingLabel: "100 g" })).toBe("100 g");
  });

  it("prints a real multiplication sign otherwise", () => {
    expect(formatIngredientQty({ qty: 2.5, servingLabel: "100 g" })).toBe("2.5 × 100 g");
    expect(formatIngredientQty({ qty: 0.5, servingLabel: "1 scoop" })).toBe("0.5 × 1 scoop");
  });
});

describe("emptyUserRecipe", () => {
  it("starts at one serving with no ingredients", () => {
    const r = emptyUserRecipe();
    expect(r.servings).toBe(1);
    expect(r.ingredients).toEqual([]);
  });
});
