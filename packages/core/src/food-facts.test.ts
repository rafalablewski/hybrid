import { describe, it, expect } from "vitest";
import {
  atwaterKcal, auditFacts, factsCompleteness, kcalFromKj, kj, per100g,
  nutritionPanel, saltFromSodiumMg, scaleFacts, sodiumMg, sumFacts, unknown, type NutritionFacts,
} from "./food-facts";

const full: NutritionFacts = { kcal: 327, protein: 14.2, carbs: 22.9, fat: 19.6, satFat: 7.3, sugar: 4.1, fiber: null, salt: 1.7 };
const sparse: NutritionFacts = { kcal: 311, protein: 10.5, carbs: 33.9, fat: 14.5 };

describe("energy units", () => {
  it("derives kJ from kcal at the labelling definition", () => {
    // The operator's own table states 327 kcal / 1368 kJ — our conversion must
    // reproduce the published second unit, not merely be close.
    expect(kj(327)).toBe(1368);
    expect(kj(172)).toBe(720); // stated 721 — 1 kJ of label rounding
  });
  it("round-trips kJ → kcal", () => {
    expect(kcalFromKj(1368)).toBe(327);
  });
});

describe("salt ↔ sodium", () => {
  it("converts the EU salt field to the US sodium field", () => {
    expect(sodiumMg(1.7)).toBe(680);
    expect(sodiumMg(0.6)).toBe(240);
  });
  it("keeps an unstated salt unstated", () => {
    expect(sodiumMg(null)).toBeNull();
    expect(sodiumMg(undefined)).toBeNull();
  });
  it("imports a US sodium value back into the salt field", () => {
    expect(saltFromSodiumMg(680)).toBe(1.7);
  });
});

describe("unknown vs zero", () => {
  it("treats a missing field as unknown and a real zero as stated", () => {
    expect(unknown(null)).toBe(true);
    expect(unknown(undefined)).toBe(true);
    expect(unknown(0)).toBe(false);
  });
});

describe("scaleFacts", () => {
  it("scales the macros", () => {
    const s = scaleFacts(full, 2);
    expect(s.kcal).toBe(654);
    expect(s.protein).toBe(28.4);
  });
  it("scales stated panel fields and leaves unstated ones null", () => {
    const s = scaleFacts(full, 2);
    expect(s.satFat).toBe(14.6);
    expect(s.fiber).toBeNull(); // twice an unknown is still an unknown
  });
  it("handles a half portion", () => {
    expect(scaleFacts(full, 0.5).salt).toBe(0.9);
  });
  it("falls back to one serving on a nonsense quantity", () => {
    expect(scaleFacts(full, 0).kcal).toBe(327);
  });
});

describe("sumFacts", () => {
  it("adds a meal's components", () => {
    const { total } = sumFacts([full, full]);
    expect(total.kcal).toBe(654);
    expect(total.satFat).toBe(14.6);
  });
  it("drops a field to unknown when any component fails to state it", () => {
    // A cheeseburger with stated sugar + a chicken burger without one does NOT
    // total to 4.1 g of sugar — that would under-report, so the total is unknown.
    const { total, partial } = sumFacts([full, sparse]);
    expect(total.kcal).toBe(638);
    expect(total.sugar).toBeNull();
    expect(partial).toContain("sugar");
  });
});

describe("factsCompleteness", () => {
  it("scores how much of the label panel is stated", () => {
    expect(factsCompleteness(full)).toBeCloseTo(0.75); // satFat + sugar + salt
    expect(factsCompleteness(sparse)).toBe(0);
  });
});

describe("auditFacts", () => {
  it("passes a real published label", () => {
    // 19.6·9 + 22.9·4 + 14.2·4 = 325 vs a stated 327 — inside tolerance.
    expect(auditFacts(full)).toEqual([]);
    expect(atwaterKcal(full)).toBe(325);
  });
  it("catches an energy figure that cannot come from the macros", () => {
    expect(auditFacts({ ...full, kcal: 900 })[0]).toMatch(/disagrees/);
  });
  it("catches saturates above total fat and sugars above total carbs", () => {
    expect(auditFacts({ ...full, satFat: 25 }).join()).toMatch(/saturates exceed/);
    expect(auditFacts({ ...full, sugar: 30 }).join()).toMatch(/sugars exceed/);
  });
});

describe("nutritionPanel", () => {
  it("returns the EU label order, with sub-rows under their parent", () => {
    expect(nutritionPanel(full).map((r) => r.key))
      .toEqual(["energy", "fat", "satFat", "carbs", "sugar", "fiber", "protein", "salt"]);
    expect(nutritionPanel(full).find((r) => r.key === "satFat")!.sub).toBe(true);
  });
  it("states energy in both units and salt with its sodium equivalent", () => {
    const p = nutritionPanel(full);
    expect(p[0]!.value).toBe("327 kcal");
    expect(p[0]!.note).toBe("1368 kJ");
    expect(p.find((r) => r.key === "salt")!.note).toBe("680 mg sodium");
  });
  it("keeps the panel's SHAPE when fields are unstated — null, not a missing row", () => {
    const p = nutritionPanel(sparse);
    expect(p).toHaveLength(8);
    expect(p.find((r) => r.key === "satFat")!.value).toBeNull();
    expect(p.find((r) => r.key === "salt")!.note).toBeNull();
    expect(p.find((r) => r.key === "fat")!.value).toBe("14.5 g");
  });
});

describe("per100g", () => {
  it("normalizes a serving to 100 g for honest comparison", () => {
    const p = per100g(full, 121)!;
    expect(p.kcal).toBe(270);
    expect(p.fat).toBeCloseTo(16.2, 1);
  });
  it("returns null when the serving weight was never published", () => {
    expect(per100g(full, null)).toBeNull();
  });
});
