import { describe, expect, it } from "vitest";
import {
  SERVING_UNITS,
  compatibleUnits,
  composeServingLabel,
  convertServing,
  formatServing,
  parseServing,
  resolveUnit,
  servingGrams,
} from "./serving-units";

describe("the registry", () => {
  it("gives every unit a base except the counts", () => {
    for (const u of SERVING_UNITS) {
      if (u.kind === "count") expect(u.base).toBeNull();
      else expect(u.base).toBeGreaterThan(0);
    }
  });

  it("resolves the spellings people type and the ones the old form wrote", () => {
    expect(resolveUnit("gram")!.id).toBe("g");
    expect(resolveUnit("GRAMS")!.id).toBe("g");
    expect(resolveUnit("ounces")!.id).toBe("oz");
    expect(resolveUnit("tablespoons")!.id).toBe("tbsp");
    expect(resolveUnit("portions")!.id).toBe("serving");
    expect(resolveUnit("banana")).toBeUndefined();
  });
});

describe("parseServing — recovering structure from stored text", () => {
  it("reads the labels already in the database", () => {
    expect(parseServing("100 g")).toMatchObject({ qty: 100, unit: "g" });
    expect(parseServing("1 scoop")).toMatchObject({ qty: 1, unit: "scoop" });
    expect(parseServing("30g")).toMatchObject({ qty: 30, unit: "g" });
    expect(parseServing("1 tbsp")).toMatchObject({ qty: 1, unit: "tbsp" });
  });

  it("defaults a missing quantity to one", () => {
    expect(parseServing("scoop")).toMatchObject({ qty: 1, unit: "scoop" });
  });

  it("reads a bare number as a count of servings", () => {
    expect(parseServing("2")).toMatchObject({ qty: 2, unit: "serving" });
  });

  it("treats an empty label as one serving", () => {
    expect(parseServing("")).toMatchObject({ qty: 1, unit: "serving" });
    expect(parseServing(null)).toMatchObject({ qty: 1, unit: "serving" });
  });

  it("takes the leading unit when the label says more", () => {
    expect(parseServing("1 cup chopped")).toMatchObject({ qty: 1, unit: "cup" });
  });

  it("KEEPS an unmodelled word instead of flattening it to 'serving'", () => {
    // "1 medium" and "1 serving" are different claims and the athlete's own
    // description is the only one we have.
    const s = parseServing("1 medium");
    expect(s.unit).toBeNull();
    expect(s.freeUnit).toBe("medium");
    expect(s.qty).toBe(1);
  });

  it("accepts a decimal comma and never loses the original text", () => {
    const s = parseServing("1,5 kg");
    expect(s.qty).toBe(1.5);
    expect(s.unit).toBe("kg");
    expect(s.raw).toBe("1,5 kg");
  });

  it("refuses a nonsense quantity rather than storing it", () => {
    expect(parseServing("0 g").qty).toBe(1);
  });
});

describe("formatServing", () => {
  it("round-trips a parsed label", () => {
    expect(formatServing(parseServing("100 g"))).toBe("100 g");
    expect(formatServing(parseServing("2 slice"))).toBe("2 slice");
  });

  it("drops the number only for a single generic serving", () => {
    expect(formatServing(parseServing("1 serving"))).toBe("serving");
    // A real count keeps it — "slice" alone reads as a food, not an amount.
    expect(formatServing(parseServing("1 slice"))).toBe("1 slice");
  });

  it("prints an unmodelled unit as written", () => {
    expect(formatServing(parseServing("1 medium"))).toBe("1 medium");
  });
});

describe("servingGrams", () => {
  it("is exact for mass", () => {
    expect(servingGrams(parseServing("100 g"))).toEqual({ grams: 100, assumed: false });
    expect(servingGrams(parseServing("8 oz"))!.grams).toBeCloseTo(226.8, 1);
    expect(servingGrams(parseServing("1 kg"))).toEqual({ grams: 1_000, assumed: false });
  });

  it("FLAGS a volume conversion as an assumption", () => {
    // A cup of water and a cup of honey differ by 40%; the number is usable but
    // the guess must be visible.
    const cup = servingGrams(parseServing("1 cup"))!;
    expect(cup.grams).toBeCloseTo(236.6, 1);
    expect(cup.assumed).toBe(true);
  });

  it("returns nothing for a count — nobody can weigh '1 medium'", () => {
    expect(servingGrams(parseServing("1 scoop"))).toBeNull();
    expect(servingGrams(parseServing("1 medium"))).toBeNull();
    expect(servingGrams(parseServing("1 serving"))).toBeNull();
  });

  it("lets a RECORDED weight outrank a derived one", () => {
    // A scoop has no derivable weight, but the product recorded 30 g.
    expect(servingGrams(parseServing("1 scoop"), 30)).toEqual({ grams: 30, assumed: false });
    // And a stored figure beats even an exact mass conversion — it is measured.
    expect(servingGrams(parseServing("1 cup"), 120)).toEqual({ grams: 120, assumed: false });
  });

  it("ignores a stored figure that is not usable", () => {
    expect(servingGrams(parseServing("100 g"), 0)).toEqual({ grams: 100, assumed: false });
    expect(servingGrams(parseServing("1 scoop"), null)).toBeNull();
  });
});

describe("convertServing", () => {
  it("converts within mass and within volume", () => {
    expect(convertServing(parseServing("1000 g"), "kg")!.qty).toBe(1);
    expect(convertServing(parseServing("1 cup"), "ml")!.qty).toBeCloseTo(236.588, 2);
  });

  it("REFUSES mass ⇄ volume — that needs a density we do not have", () => {
    expect(convertServing(parseServing("100 g"), "ml")).toBeNull();
    expect(convertServing(parseServing("1 cup"), "g")).toBeNull();
  });

  it("refuses anything involving a count", () => {
    expect(convertServing(parseServing("1 scoop"), "g")).toBeNull();
    expect(convertServing(parseServing("100 g"), "scoop")).toBeNull();
    expect(convertServing(parseServing("1 medium"), "g")).toBeNull();
  });

  it("round-trips without drift", () => {
    const there = convertServing(parseServing("250 g"), "oz")!;
    const back = convertServing(there, "g")!;
    expect(back.qty).toBeCloseTo(250, 1);
  });
});

describe("compatibleUnits", () => {
  it("offers the same dimension only", () => {
    expect(compatibleUnits(parseServing("100 g")).map((u) => u.id)).toEqual(["g", "kg", "oz", "lb"]);
    expect(compatibleUnits(parseServing("1 cup")).map((u) => u.id)).toEqual(["ml", "cl", "l", "floz", "cup", "tbsp", "tsp"]);
  });

  it("offers nothing for a count — '1 slice' is not 28 of anything", () => {
    expect(compatibleUnits(parseServing("1 slice"))).toEqual([]);
    expect(compatibleUnits(parseServing("1 medium"))).toEqual([]);
  });
});

describe("composeServingLabel", () => {
  it("writes exactly what parseServing will read back", () => {
    for (const [qty, unit] of [["100", "g"], ["1", "scoop"], ["2.5", "tbsp"], ["1,5", "kg"]] as const) {
      const label = composeServingLabel(qty, unit);
      const back = parseServing(label);
      expect(back.unit).toBe(unit);
      expect(back.qty).toBe(parseFloat(String(qty).replace(",", ".")));
    }
  });

  it("falls back to one serving on junk", () => {
    expect(parseServing(composeServingLabel("", "nope"))).toMatchObject({ qty: 1, unit: "serving" });
  });
});
