import { describe, expect, it } from "vitest";
import { convertQty, matchRecipeLine, normalizeFoodName, type FoodCandidate } from "./recipe-match";
import { recipeById } from "./recipes";
import type { NutritionFacts } from "./food-facts";

const facts = (kcal: number): NutritionFacts => ({ kcal, protein: 0, carbs: 0, fat: 0, satFat: null, sugar: null, fiber: null, salt: null });

const food = (name: string, servingLabel: string, extra: Partial<FoodCandidate> = {}): FoodCandidate => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  servingLabel,
  facts: facts(100),
  ...extra,
});

const line = (name: string, qty: number, unit: string) => ({ name, qty, unit });

describe("normalizeFoodName", () => {
  it("ignores case, accents, punctuation and a trailing plural", () => {
    expect(normalizeFoodName("Large Eggs")).toBe("large egg");
    expect(normalizeFoodName("large egg")).toBe("large egg");
    expect(normalizeFoodName("Crème fraîche")).toBe("creme fraiche");
    expect(normalizeFoodName("Chopped  tomatoes!")).toBe("chopped tomatoe");
  });

  it("keeps word order — two foods are not the same because they share words", () => {
    expect(normalizeFoodName("chicken stock")).not.toBe(normalizeFoodName("stock chicken"));
  });

  it("does not maul a short word ending in s", () => {
    expect(normalizeFoodName("Gas")).toBe("gas");
    expect(normalizeFoodName("Swiss")).toBe("swiss");
  });
});

describe("convertQty", () => {
  const l = line("Chopped tomatoes", 400, "g");

  it("converts mass into the candidate's own servings", () => {
    // 400 g of a food sold in 100 g servings is four of them.
    expect(convertQty(l, food("Chopped tomatoes", "100 g"), 2, 2)).toBe(4);
  });

  it("scales with the serving count the copy is taken at", () => {
    expect(convertQty(l, food("Chopped tomatoes", "100 g"), 4, 2)).toBe(8);
    expect(convertQty(l, food("Chopped tomatoes", "100 g"), 1, 2)).toBe(2);
  });

  it("prefers a MEASURED serving weight over a derived one", () => {
    expect(convertQty(l, food("Chopped tomatoes", "1 tin", { servingGrams: 200 }), 2, 2)).toBe(2);
  });

  it("refuses a conversion that had to ASSUME a density", () => {
    // "1 cup" only becomes grams at water density, which is a guess about the
    // food rather than arithmetic.
    expect(convertQty(l, food("Chopped tomatoes", "1 cup"), 2, 2)).toBeNull();
  });

  it("matches a count against a count, and never against a weight", () => {
    const eggs = line("Large eggs", 4, "");
    expect(convertQty(eggs, food("Large eggs", "1 egg"), 2, 2)).toBe(4);
    expect(convertQty(eggs, food("Large eggs", "2 eggs"), 2, 2)).toBe(2);
    expect(convertQty(eggs, food("Large eggs", "60 g"), 2, 2)).toBeNull();
  });

  it("refuses to cross dimensions — a tablespoon of WHAT weighs how much?", () => {
    expect(convertQty(line("Olive oil", 2, "tbsp"), food("Olive oil", "100 g"), 2, 2)).toBeNull();
  });

  it("does the volume arithmetic when both sides are volumes", () => {
    // A tablespoon is a defined volume, so this is arithmetic, not a guess.
    expect(convertQty(line("Olive oil", 2, "tbsp"), food("Olive oil", "100 ml"), 2, 2)).toBeCloseTo(0.2957, 3);
  });

  it("refuses a line measured in something nobody can size", () => {
    expect(convertQty(line("Basil", 1, "handful"), food("Basil", "10 g"), 2, 2)).toBeNull();
  });

  it("reads the candidate's own word as one of them", () => {
    expect(convertQty(line("Large eggs", 4, ""), food("Large eggs", "1 medium"), 2, 2)).toBe(4);
  });

  it("normalises kg and l to the unit the candidate is sold in", () => {
    expect(convertQty(line("Flour", 1, "kg"), food("Flour", "100 g"), 2, 2)).toBe(10);
    expect(convertQty(line("Milk", 1, "l"), food("Milk", "250 ml"), 2, 2)).toBe(4);
  });
});

describe("matchRecipeLine", () => {
  const l = line("Chopped tomatoes", 400, "g");
  const tomatoes = food("Chopped tomatoes", "100 g");

  it("finds the one food that IS this line", () => {
    const hit = matchRecipeLine(l, [food("Pasta", "100 g"), tomatoes], 2, 2);
    expect(hit?.candidate.id).toBe("chopped-tomatoes");
    expect(hit?.qty).toBe(4);
  });

  it("returns nothing when two candidates match equally well", () => {
    // Picking one would be a coin toss with a confident number attached.
    const dupe = { ...tomatoes, id: "other-tomatoes" };
    expect(matchRecipeLine(l, [tomatoes, dupe], 2, 2)).toBeNull();
  });

  it("never matches on overlap — a different food is a different food", () => {
    expect(matchRecipeLine(l, [food("Tomato purée", "100 g")], 2, 2)).toBeNull();
    expect(matchRecipeLine(l, [food("Tomatoes", "100 g")], 2, 2)).toBeNull();
  });

  it("returns nothing when the name matches but the units cannot", () => {
    expect(matchRecipeLine(l, [food("Chopped tomatoes", "1 handful")], 2, 2)).toBeNull();
  });

  it("finds nothing in an empty library, which is the common case", () => {
    expect(matchRecipeLine(l, [], 2, 2)).toBeNull();
  });

  it("matches a real library line against a real-looking product", () => {
    const shakshuka = recipeById("shakshuka")!;
    const tomatoLine = shakshuka.ingredients.find((i) => i.name === "Chopped tomatoes")!;
    const hit = matchRecipeLine(tomatoLine, [food("Chopped tomatoes", "100 g")], shakshuka.baseServes, shakshuka.baseServes);
    expect(hit?.qty).toBe(4);
  });
});
