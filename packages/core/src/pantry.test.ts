import { describe, expect, it } from "vitest";
import {
  FOOD_ROLES,
  PANTRY_LIGHT_KCAL,
  foodRole,
  matchesQuery,
  pantryShelves,
  pantryStats,
  roleCounts,
  roleShares,
  type PantryFood,
} from "./pantry";

const food = (name: string, p: number, c: number, f: number, extra: Partial<PantryFood> = {}): PantryFood => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  servingLabel: "100 g",
  kcal: Math.round(p * 4 + c * 4 + f * 9),
  protein: p, carbs: c, fat: f,
  ...extra,
});

// Real foods, per 100 g, because the whole claim of this engine is that it
// shelves the food an athlete actually saves.
const chicken = () => food("Chicken breast", 31, 0, 3.6);
const egg = () => food("Egg", 13, 1, 11);
const yogurt = () => food("Greek yogurt", 10, 4, 0.4);
const rice = () => food("White rice", 2.7, 28, 0.3);
const bread = () => food("Rye bread", 7.1, 39, 1.1);
const banana = () => food("Banana", 1.1, 23, 0.3);
const oil = () => food("Olive oil", 0, 0, 100);
const almonds = () => food("Almonds", 21, 22, 50);
const milk = () => food("Whole milk", 3.4, 4.8, 3.6);
const coffee = () => food("Black coffee", 0.1, 0, 0);

describe("roleShares", () => {
  it("splits a serving's energy at 4·4·9, not by gram weight", () => {
    const s = roleShares({ protein: 10, carbs: 10, fat: 10 });
    expect(s.kcal).toBe(170);
    expect(s.protein).toBeCloseTo(40 / 170, 5);
    expect(s.fat).toBeCloseTo(90 / 170, 5);
  });

  it("returns zeros rather than NaN for a food with no macro energy", () => {
    const s = roleShares({ protein: 0, carbs: 0, fat: 0 });
    expect(s).toEqual({ protein: 0, carb: 0, fat: 0, kcal: 0 });
  });

  it("never lets a negative macro pull a share below zero", () => {
    const s = roleShares({ protein: -5, carbs: 20, fat: 0 });
    expect(s.protein).toBe(0);
    expect(s.carb).toBe(1);
  });
});

describe("foodRole", () => {
  it("shelves the obvious cases the way an athlete would", () => {
    expect(foodRole(chicken())).toBe("protein");
    expect(foodRole(yogurt())).toBe("protein");
    expect(foodRole(rice())).toBe("carb");
    expect(foodRole(bread())).toBe("carb");
    expect(foodRole(banana())).toBe("carb");
    expect(foodRole(oil())).toBe("fat");
    expect(foodRole(almonds())).toBe("fat");
  });

  it("shelves an egg as PROTEIN even though most of its energy is fat", () => {
    // 52 kcal protein vs 99 kcal fat — a majority rule would call this a fat,
    // which is true arithmetic and useless to somebody stocking a protein shelf.
    const s = roleShares(egg());
    expect(s.fat).toBeGreaterThan(s.protein);
    expect(foodRole(egg())).toBe("protein");
  });

  it("leaves a genuinely balanced food MIXED instead of forcing a shelf", () => {
    // Whole milk: fat ~50 %, protein ~21 % — neither bar is met.
    expect(foodRole(milk())).toBe("mixed");
  });

  it("calls a near-empty serving LIGHT rather than reading noise as a shelf", () => {
    expect(foodRole(coffee())).toBe("light");
    expect(foodRole({ protein: 0, carbs: 1, fat: 0 })).toBe("light"); // 4 kcal
    expect(roleShares({ protein: 0, carbs: 1, fat: 0 }).kcal).toBeLessThan(PANTRY_LIGHT_KCAL);
  });

  it("shelves every food somewhere", () => {
    for (const f of [chicken(), egg(), rice(), oil(), milk(), coffee()])
      expect(FOOD_ROLES).toContain(foodRole(f));
  });
});

describe("matchesQuery", () => {
  const jogurt = food("Jogurt naturalny", 5, 6, 3, { subname: "Piątnica", servingLabel: "150 g" });

  it("matches on the name, accent- and case-folded", () => {
    expect(matchesQuery(jogurt, "jogurt")).toBe(true);
    expect(matchesQuery(jogurt, "JOGURT")).toBe(true);
    expect(matchesQuery(jogurt, "piatnica")).toBe(true); // ą folded
  });

  it("matches the athlete's own subname and the serving label", () => {
    expect(matchesQuery(jogurt, "150")).toBe(true);
    expect(matchesQuery(jogurt, "nope")).toBe(false);
  });

  it("matches words in any order, so the stored order need not be remembered", () => {
    const whey = food("Chocolate whey", 24, 3, 2);
    expect(matchesQuery(whey, "whey choc")).toBe(true);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesQuery(jogurt, "")).toBe(true);
    expect(matchesQuery(jogurt, "   ")).toBe(true);
  });
});

describe("pantryShelves", () => {
  const all = () => [oil(), chicken(), rice(), yogurt(), banana(), coffee(), milk()];

  it("groups into shelves in role order and drops the empty ones", () => {
    const shelves = pantryShelves([chicken(), rice()]);
    expect(shelves.map((s) => s.role)).toEqual(["protein", "carb"]);
  });

  it("sorts alphabetically INSIDE a shelf, not by the order it was given", () => {
    const shelves = pantryShelves([yogurt(), chicken()]);
    expect(shelves[0].items.map((f) => f.name)).toEqual(["Chicken breast", "Greek yogurt"]);
  });

  it("narrows to one role", () => {
    const shelves = pantryShelves(all(), { role: "fat" });
    expect(shelves).toHaveLength(1);
    expect(shelves[0].items.map((f) => f.name)).toEqual(["Olive oil"]);
  });

  it("filters BEFORE shelving, so a search inside a role narrows what is on screen", () => {
    const shelves = pantryShelves(all(), { role: "protein", query: "chicken" });
    expect(shelves).toHaveLength(1);
    expect(shelves[0].items).toHaveLength(1);
    // The query must not re-populate the shelves the role filtered away.
    expect(pantryShelves(all(), { role: "protein", query: "rice" })).toEqual([]);
  });

  it("returns nothing at all for a query nothing answers", () => {
    expect(pantryShelves(all(), { query: "zzzz" })).toEqual([]);
  });

  it("is empty for an empty pantry", () => {
    expect(pantryShelves([])).toEqual([]);
  });
});

describe("roleCounts", () => {
  it("counts every role, including the ones with nothing on them", () => {
    const counts = roleCounts([chicken(), yogurt(), rice()]);
    expect(counts).toEqual({ protein: 2, carb: 1, fat: 0, mixed: 0, light: 0 });
  });

  it("counts each food exactly once", () => {
    const items = [oil(), chicken(), rice(), milk(), coffee()];
    const counts = roleCounts(items);
    expect(FOOD_ROLES.reduce((n, r) => n + counts[r], 0)).toBe(items.length);
  });
});

describe("pantryStats", () => {
  const stated = (name: string) => food(name, 20, 10, 5, { satFat: 1, sugar: 2, fiber: 3, salt: 0.4 });

  it("reports an empty pantry as empty, with no lead shelf", () => {
    expect(pantryStats([])).toEqual({ count: 0, complete: 0, completeness: 0, lead: null });
  });

  it("counts only FULLY stated foods as complete", () => {
    const half = food("Half", 20, 10, 5, { sugar: 2, salt: 0.4 });
    const s = pantryStats([stated("A"), half]);
    expect(s.count).toBe(2);
    expect(s.complete).toBe(1);
    expect(s.completeness).toBeCloseTo((1 + 0.5) / 2, 5);
  });

  it("names the most-populated shelf", () => {
    expect(pantryStats([chicken(), yogurt(), rice()]).lead).toBe("protein");
    expect(pantryStats([rice(), bread(), chicken()]).lead).toBe("carb");
  });

  it("breaks a tie by role order rather than by input order", () => {
    expect(pantryStats([rice(), chicken()]).lead).toBe("protein");
    expect(pantryStats([chicken(), rice()]).lead).toBe("protein");
  });
});
