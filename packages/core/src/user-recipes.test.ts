import { describe, expect, it } from "vitest";
import {
  MAX_RECIPE_SERVINGS,
  emptyUserRecipe,
  formatIngredientQty,
  ingredientFacts,
  libraryRecipeToLog,
  recipeServings,
  recipeToLog,
  recipeTotals,
  refreshIngredients,
  scaleRecipeTo,
  staleIngredients,
  canLogRecipe,
  libraryRecipeToUserRecipe,
  linkIngredient,
  userRecipeShareText,
  userRecipeShareView,
  type UserRecipe,
  type UserRecipeIngredient,
} from "./user-recipes";
import type { NutritionFacts } from "./food-facts";
import { RECIPES } from "./recipes";

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

describe("libraryRecipeToLog", () => {
  const ramen = () => RECIPES.find((r) => r.id === "ramen")!;

  it("logs ONE serving by default, not the whole tray", () => {
    const draft = libraryRecipeToLog(ramen());
    expect(draft.qty).toBe(1);
    expect(draft.facts.kcal).toBe(ramen().macros.kcal); // per-serve, not × baseServes
  });

  it("carries the per-serve macros unchanged at any quantity", () => {
    const draft = libraryRecipeToLog(ramen(), 3);
    expect(draft.qty).toBe(3);
    expect(draft.facts.protein).toBe(ramen().macros.protein);
  });

  it("names the portion by what was COOKED, not by what was eaten", () => {
    expect(libraryRecipeToLog(ramen(), 1).subname).toBe(`1 of ${ramen().baseServes}`);
    expect(libraryRecipeToLog(ramen(), 1, 6).subname).toBe("1 of 6");
  });

  it("leaves the panel NOT STATED — a curated recipe states four macros and no more", () => {
    const f = libraryRecipeToLog(ramen()).facts;
    expect(f.sugar).toBeNull();
    expect(f.satFat).toBeNull();
    expect(f.fiber).toBeNull();
    expect(f.salt).toBeNull();
  });

  it("refuses nonsense quantities and serve counts", () => {
    expect(libraryRecipeToLog(ramen(), 0).qty).toBe(1);
    expect(libraryRecipeToLog(ramen(), -2).qty).toBe(1);
    expect(libraryRecipeToLog(ramen(), 1, 0).subname).toBe("1 of 1");
    expect(libraryRecipeToLog(ramen(), 1, -3).subname).toBe("1 of 1");
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

describe("sharing your own recipe", () => {
  const T = {
    mins: (n: number) => `${n} min`,
    serves: (n: number) => `serves ${n}`,
    macros: (f: NutritionFacts) => `${f.kcal} kcal, ${f.protein} g protein per serving`,
    ingredientsHead: (n: number) => `INGREDIENTS (${n} SERVINGS)`,
    credit: "From HYBRID",
  };

  it("states the DERIVED per-serving numbers, never a typed figure", () => {
    const r = pasta();
    const v = userRecipeShareView(r, T);
    const { perServing } = recipeTotals(r);
    expect(v.macroLine).toBe(`${perServing.kcal} kcal, ${perServing.protein} g protein per serving`);
    expect(v.title).toBe("Chicken pasta");
    expect(v.ingredientsHead).toBe("INGREDIENTS (2 SERVINGS)");
  });

  it("writes each line the way the editor does, in the athlete's own order", () => {
    const r = pasta();
    r.ingredients[0]!.position = 2;
    r.ingredients[1]!.position = 1;
    r.ingredients[2]!.position = 0;
    const v = userRecipeShareView(r, T);
    expect(v.ingredients).toEqual(["1.5 × 100 g Tomato sauce", "100 g Pasta", "2.5 × 100 g Chicken breast"]);
  });

  it("carries NO link — a private recipe has no public address", () => {
    const text = userRecipeShareText(pasta(), T);
    expect(userRecipeShareView(pasta(), T).link).toBeUndefined();
    expect(text).not.toContain("http");
    expect(text.endsWith("From HYBRID")).toBe(true);
  });

  it("prints no METHOD heading, because the model holds no method", () => {
    expect(userRecipeShareText(pasta(), T)).not.toContain("METHOD");
  });

  it("states the time only when the athlete recorded one", () => {
    expect(userRecipeShareView(pasta(), T).meta).toEqual(["serves 2"]);
    expect(userRecipeShareView({ ...pasta(), timeMins: 25 }, T).meta).toEqual(["25 min", "serves 2"]);
    expect(userRecipeShareView({ ...pasta(), timeMins: 0 }, T).meta).toEqual(["serves 2"]);
  });
});

describe("a line that does not know its numbers", () => {
  const withUnknown = (): UserRecipe => {
    const r = pasta();
    r.ingredients[1] = { ...r.ingredients[1]!, unstated: true, facts: facts({ kcal: 0 }), qty: 1, servingLabel: "100 g" };
    return r;
  };

  it("is left OUT of the totals and named, never summed as zero", () => {
    const t = recipeTotals(withUnknown());
    expect(t.unstated).toEqual(["Pasta"]);
    // The two counted lines still add up; the pasta simply is not in it.
    const counted = recipeTotals({ ...pasta(), ingredients: [pasta().ingredients[0]!, pasta().ingredients[2]!] });
    expect(t.total.kcal).toBe(counted.total.kcal);
    expect(t.ingredientCount).toBe(3);
  });

  it("reports nothing unstated for an ordinary recipe", () => {
    expect(recipeTotals(pasta()).unstated).toEqual([]);
  });

  it("cannot be logged to the day — a floor is not a total", () => {
    expect(canLogRecipe(pasta())).toBe(true);
    expect(canLogRecipe(withUnknown())).toBe(false);
    expect(canLogRecipe({ ...pasta(), ingredients: [] })).toBe(false);
  });

  it("clears when the line is linked to a food that states its numbers", () => {
    const r = withUnknown();
    const linked = linkIngredient(r, "i2", { id: "p9", servingLabel: "100 g", facts: facts({ kcal: 350, protein: 12, carbs: 71, fat: 1.5 }) }, 2);
    const line = linked.ingredients.find((i) => i.id === "i2")!;
    expect(line.unstated).toBe(false);
    expect(line.name).toBe("Pasta");
    expect(line.qty).toBe(2);
    expect(line.productId).toBe("p9");
    expect(canLogRecipe(linked)).toBe(true);
    expect(recipeTotals(linked).unstated).toEqual([]);
  });

  it("links a VERIFIED source through the other id", () => {
    const linked = linkIngredient(withUnknown(), "i2", { id: "v1", servingLabel: "100 g", facts: facts({ kcal: 10 }), verified: true });
    const line = linked.ingredients.find((i) => i.id === "i2")!;
    expect(line.verifiedId).toBe("v1");
    expect(line.productId).toBeNull();
  });
});

describe("copying a library recipe into your own", () => {
  const shakshuka = RECIPES.find((r) => r.id === "shakshuka")!;
  const source = (name: string, servingLabel: string, kcal: number) => ({
    id: name.toLowerCase(), name, servingLabel, facts: facts({ kcal }),
  });

  it("copies every line, with the ones it could not identify marked unstated", () => {
    const { recipe, matched, unmatched } = libraryRecipeToUserRecipe(shakshuka, 2, [source("Chopped tomatoes", "100 g", 20)]);
    expect(recipe.name).toBe("Shakshuka");
    expect(recipe.servings).toBe(2);
    expect(recipe.timeMins).toBe(20);
    expect(recipe.ingredients).toHaveLength(shakshuka.ingredients.length);
    expect(matched).toBe(1);
    expect(unmatched).toBe(shakshuka.ingredients.length - 1);
    const tomatoes = recipe.ingredients.find((i) => i.name === "Chopped tomatoes")!;
    expect(tomatoes.unstated).toBe(false);
    expect(tomatoes.qty).toBe(4);
    expect(tomatoes.productId).toBe("chopped tomatoes");
  });

  it("never writes a confident zero — an unmatched line SAYS it is unknown", () => {
    const { recipe } = libraryRecipeToUserRecipe(shakshuka, 2, []);
    for (const line of recipe.ingredients) {
      expect(line.unstated, line.name).toBe(true);
      expect(line.facts.kcal).toBe(0);
    }
    // …and the recipe that results refuses to be logged.
    expect(canLogRecipe({ id: "", ...recipe })).toBe(false);
    expect(recipeTotals({ id: "", ...recipe }).unstated).toHaveLength(shakshuka.ingredients.length);
  });

  it("keeps the RECIPE'S OWN measure on an unknown line, so the row still says how much", () => {
    const { recipe } = libraryRecipeToUserRecipe(shakshuka, 4, []);
    const tomatoes = recipe.ingredients.find((i) => i.name === "Chopped tomatoes")!;
    // 400 g for two servings, copied at four.
    expect(tomatoes.servingLabel).toBe("800 g");
    const eggs = recipe.ingredients.find((i) => i.name === "Large eggs")!;
    expect(eggs.servingLabel).toBe("8");
  });

  it("is taken at the serving count on screen, and clamps a nonsense one", () => {
    expect(libraryRecipeToUserRecipe(shakshuka, 6, []).recipe.servings).toBe(6);
    expect(libraryRecipeToUserRecipe(shakshuka, 0, []).recipe.servings).toBe(shakshuka.baseServes);
    expect(libraryRecipeToUserRecipe(shakshuka, -4, []).recipe.servings).toBe(shakshuka.baseServes);
    expect(libraryRecipeToUserRecipe(shakshuka, 9999, []).recipe.servings).toBe(MAX_RECIPE_SERVINGS);
  });

  it("carries no method — the model holds foods and quantities, not prose", () => {
    const { recipe } = libraryRecipeToUserRecipe(shakshuka, 2, []);
    expect(recipe.note).toBe(shakshuka.note);
    expect(Object.keys(recipe)).not.toContain("steps");
  });
});
