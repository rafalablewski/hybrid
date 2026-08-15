import { describe, expect, it } from "vitest";
import {
  dedupePortions,
  foodPortions,
  formatAmount,
  loggedAmountLabel,
  loggedAmountShown,
  loggedPortionOf,
  parsePackSize,
  rescaleLoggedAmount,
  stepLoggedPortion,
  portionAmount,
  portionEquivalent,
  portionMeasure,
  portionQty,
  portionStep,
  portionUnit,
  portionUnits,
  parseFoodPortions,
  usualAmounts,
} from "./portion";

/** The kefir on the shelf: a 100 g label, a 400 g bottle the catalog knows about. */
const KEFIR = { serving: "100 g", portions: [{ label: "bottle", size: 400, source: "catalog" as const }] };

describe("portionMeasure — what this food can be weighed in", () => {
  it("reads grams off a mass label", () => {
    expect(portionMeasure({ serving: "100 g" })).toEqual({ unit: "g", perServing: 100 });
  });

  it("prefers a RECORDED weight over one derived from the label", () => {
    expect(portionMeasure({ serving: "1 scoop", servingGrams: 30 })).toEqual({ unit: "g", perServing: 30 });
  });

  it("measures a volume serving in millilitres, never in guessed grams", () => {
    expect(portionMeasure({ serving: "250 ml" })).toEqual({ unit: "ml", perServing: 250 });
    // Even with a weight on file: the label is a volume, so the control is.
    expect(portionMeasure({ serving: "0.5 l", servingGrams: 500 })).toEqual({ unit: "ml", perServing: 500 });
  });

  it("converts an exact mass unit", () => {
    const m = portionMeasure({ serving: "2 oz" })!;
    expect(m.unit).toBe("g");
    expect(m.perServing).toBeCloseTo(56.7, 1);
  });

  it("gives a bare count no measure at all", () => {
    expect(portionMeasure({ serving: "1 slice" })).toBeNull();
    expect(portionMeasure({ serving: "1 medium" })).toBeNull();
    expect(portionMeasure({ serving: null })).toBeNull();
  });

  it("does not treat a cup as a weight — that conversion is an assumption", () => {
    expect(portionMeasure({ serving: "1 cup" })).toEqual({ unit: "ml", perServing: 236.59 });
  });
});

describe("portionUnits — the units the editor offers", () => {
  it("always offers servings, even for a food it cannot measure", () => {
    const units = portionUnits({ serving: "1 slice" });
    expect(units.map((u) => u.id)).toEqual(["servings"]);
  });

  it("adds the measure when the food states one", () => {
    const units = portionUnits({ serving: "100 g" });
    expect(units.map((u) => u.id)).toEqual(["servings", "measure"]);
    expect(portionUnit(units, "measure")!.symbol).toBe("g");
    // Opens on one serving's worth, so switching unit never changes the amount.
    expect(portionUnit(units, "measure")!.initial).toBe(100);
  });

  it("adds a unit per named portion, called what the athlete calls it", () => {
    const units = portionUnits(KEFIR);
    expect(units.map((u) => u.id)).toEqual(["servings", "measure", "portion:0"]);
    const bottle = portionUnit(units, "portion:0")!;
    expect(bottle.portionLabel).toBe("bottle");
    expect(bottle.source).toBe("catalog");
    // One bottle is four servings of 100 g.
    expect(bottle.servingsPer).toBe(4);
  });

  it("offers several portions, smallest first", () => {
    const units = portionUnits({
      serving: "100 g",
      portions: [
        { label: "block", size: 200, source: "catalog" },
        { label: "slice", size: 25, source: "learned" },
      ],
    });
    expect(units.filter((u) => u.kind === "portion").map((u) => u.portionLabel)).toEqual(["slice", "block"]);
  });

  it("caps the switch so it stays a switch and not a list", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `p${i}`, size: 10 * (i + 1), source: "typed" as const }));
    expect(portionUnits({ serving: "100 g", portions: many }).filter((u) => u.kind === "portion")).toHaveLength(5);
  });

  it("drops a portion it cannot express — a size with no measure has no unit", () => {
    const food = { serving: "1 slice", portions: [{ label: "pack", size: 400, source: "catalog" as const }] };
    expect(portionUnits(food).map((u) => u.id)).toEqual(["servings"]);
    expect(foodPortions(food)).toEqual([]);
  });

  it("ignores a nonsense portion size", () => {
    for (const size of [0, -5, Number.NaN]) {
      const units = portionUnits({ serving: "100 g", portions: [{ label: "x", size, source: "typed" }] });
      expect(units.map((u) => u.id)).toEqual(["servings", "measure"]);
    }
  });

  it("still honours the single pack the first cut stored", () => {
    const units = portionUnits({ serving: "100 g", packSize: 400, packLabel: "bottle" });
    expect(portionUnit(units, "portion:0")!.portionLabel).toBe("bottle");
  });
});

describe("where a portion came from", () => {
  it("keeps the best-sourced copy when two sources say the same thing", () => {
    // A scan and the catalog entry behind it are the same bottle.
    const out = dedupePortions([
      { label: "bottle", size: 400, source: "catalog" },
      { label: "bottle", size: 400, source: "scanned" },
    ]);
    expect(out).toEqual([{ label: "bottle", size: 400, source: "scanned" }]);
  });

  it("lets the athlete's own correction win over the catalog", () => {
    const out = dedupePortions([
      { label: "bottle", size: 400, source: "catalog" },
      { label: "bottle", size: 400, source: "typed" },
    ]);
    expect(out[0]!.source).toBe("typed");
  });

  it("keeps two genuinely different sizes", () => {
    const out = dedupePortions([
      { label: "bottle", size: 400, source: "catalog" },
      { label: "bottle", size: 1000, source: "catalog" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("reads a stored list without trusting it", () => {
    expect(parseFoodPortions([
      { label: "bottle", size: 400, source: "catalog" },
      { label: "broken", size: "not a number" },
      { size: 250 },                                   // unnamed = the generic pack
      { label: "nope" },                               // no size = no unit
      "garbage",
      null,
    ])).toEqual([
      { label: "", size: 250, source: "typed" },
      { label: "bottle", size: 400, source: "catalog" },
    ]);
  });

  it("survives a column that is not a list at all", () => {
    expect(parseFoodPortions(null)).toEqual([]);
    expect(parseFoodPortions("[]")).toEqual([]);
    expect(parseFoodPortions({})).toEqual([]);
  });
});

describe("usualAmounts — learned from what actually gets logged", () => {
  const log = (name: string, amount: number | null, amountUnit: string | null) => ({ name, amount, amountUnit });

  it("surfaces an amount the athlete keeps entering", () => {
    const entries = [
      log("Cheese", 35, "g"), log("Cheese", 35, "g"), log("Cheese", 35, "g"),
      log("Cheese", 50, "g"),
    ];
    expect(usualAmounts(entries, "Cheese")).toEqual([{ amount: 35, unit: "g", times: 3 }]);
  });

  it("waits for a habit rather than reacting to a coincidence", () => {
    const entries = [log("Cheese", 35, "g"), log("Cheese", 35, "g")];
    expect(usualAmounts(entries, "Cheese")).toEqual([]);
  });

  it("matches the food by an accent-folded name", () => {
    const entries = [log("Twaróg", 200, "g"), log("twarog", 200, "g"), log("TWARÓG", 200, "g")];
    expect(usualAmounts(entries, "twarog")).toEqual([{ amount: 200, unit: "g", times: 3 }]);
  });

  it("does NOT merge two different weighings", () => {
    // 35 g and 36 g are two things that happened, not one rounded thing.
    const entries = [
      log("Cheese", 35, "g"), log("Cheese", 35, "g"), log("Cheese", 35, "g"),
      log("Cheese", 36, "g"), log("Cheese", 36, "g"), log("Cheese", 36, "g"),
    ];
    expect(usualAmounts(entries, "Cheese").map((u) => u.amount)).toEqual([35, 36]);
  });

  it("ignores anything that is not a measured amount", () => {
    const entries = [
      log("Cheese", 1.5, "serving"), log("Cheese", 1.5, "serving"), log("Cheese", 1.5, "serving"),
      log("Cheese", 1, "bottle"), log("Cheese", 1, "bottle"), log("Cheese", 1, "bottle"),
      log("Cheese", null, null), log("Cheese", null, null), log("Cheese", null, null),
    ];
    expect(usualAmounts(entries, "Cheese")).toEqual([]);
  });

  it("keeps other foods out of it", () => {
    const entries = [log("Kefir", 400, "g"), log("Kefir", 400, "g"), log("Kefir", 400, "g")];
    expect(usualAmounts(entries, "Cheese")).toEqual([]);
    expect(usualAmounts(entries, "")).toEqual([]);
  });
});

describe("portionQty — what the diary is asked to store", () => {
  const units = portionUnits(KEFIR);
  const servings = portionUnit(units, "servings")!;
  const measure = portionUnit(units, "measure")!;
  const pack = portionUnit(units, "portion:0")!;

  it("logs the weight off the scale, not a rounded serving", () => {
    // 35 g of cheese against a 100 g label.
    expect(portionQty(35, measure)).toBe(0.35);
  });

  it("logs the whole bottle in one", () => {
    expect(portionQty(1, pack)).toBe(4);
    expect(portionQty(0.5, pack)).toBe(2);
  });

  it("leaves a servings count exactly as typed", () => {
    expect(portionQty(1.5, servings)).toBe(1.5);
  });

  it("treats a blank or negative amount as nothing", () => {
    expect(portionQty(0, measure)).toBe(0);
    expect(portionQty(-5, measure)).toBe(0);
    expect(portionQty(Number.NaN, measure)).toBe(0);
  });

  it("round-trips through the unit switch", () => {
    // 1 serving shown in grams is 100 g, not 1 g.
    expect(portionAmount(portionQty(1, servings), measure)).toBe(100);
    expect(portionAmount(portionQty(400, measure), pack)).toBe(1);
  });
});

describe("portionStep — pressing −/+", () => {
  const units = portionUnits({ serving: "100 g" });
  const servings = portionUnit(units, "servings")!;
  const measure = portionUnit(units, "measure")!;

  it("steps grams by five", () => {
    expect(portionStep(35, measure, 1)).toBe(40);
    expect(portionStep(35, measure, -1)).toBe(30);
  });

  it("steps servings by a half", () => {
    expect(portionStep(1, servings, 1)).toBe(1.5);
  });

  it("KEEPS an off-grid amount off-grid instead of snapping it away", () => {
    // 37 g is what the scale said. +5 is 42, not 40.
    expect(portionStep(37, measure, 1)).toBe(42);
    expect(portionStep(0.35, servings, 1)).toBe(0.85);
  });

  it("never steps below one step", () => {
    expect(portionStep(5, measure, -1)).toBe(5);
    expect(portionStep(0.5, servings, -1)).toBe(0.5);
  });

  it("clamps at the ceiling", () => {
    expect(portionStep(10_000, measure, 1, 10_000)).toBe(10_000);
  });
});

describe("portionEquivalent — the line under the stepper", () => {
  const units = portionUnits(KEFIR);

  it("says what a servings count weighs", () => {
    expect(portionEquivalent(1.5, portionUnit(units, "servings")!, units)).toEqual({ amount: 150, symbol: "g" });
  });

  it("says what a pack weighs", () => {
    expect(portionEquivalent(1, portionUnit(units, "portion:0")!, units)).toEqual({ amount: 400, symbol: "g" });
  });

  it("stays quiet when the number is already the measure", () => {
    expect(portionEquivalent(35, portionUnit(units, "measure")!, units)).toBeNull();
  });

  it("stays quiet for a food with no measure", () => {
    const only = portionUnits({ serving: "1 slice" });
    expect(portionEquivalent(1, only[0]!, only)).toBeNull();
  });
});

describe("parsePackSize", () => {
  it("takes a decimal comma, as PL and DE type it", () => {
    expect(parsePackSize("1,5")).toBe(1.5);
  });

  it("refuses nothing, zero and nonsense", () => {
    expect(parsePackSize("")).toBeNull();
    expect(parsePackSize("0")).toBeNull();
    expect(parsePackSize("-3")).toBeNull();
    expect(parsePackSize("bottle")).toBeNull();
    expect(parsePackSize(null)).toBeNull();
  });
});

describe("what the diary remembers", () => {
  const units = portionUnits(KEFIR);
  const servings = portionUnit(units, "servings")!;
  const measure = portionUnit(units, "measure")!;
  const pack = portionUnit(units, "portion:0")!;
  const words = { pack: "pack" };

  it("writes the amount in the unit it was entered in", () => {
    expect(loggedPortionOf(35, measure)).toEqual({ amount: 35, amountUnit: "g" });
    expect(loggedPortionOf(1, pack)).toEqual({ amount: 1, amountUnit: "bottle" });
    expect(loggedPortionOf(1.5, servings)).toEqual({ amount: 1.5, amountUnit: "serving" });
  });

  it("stores a CANONICAL token for an unnamed pack, never a translated word", () => {
    const unnamed = portionUnit(portionUnits({ serving: "100 g", portions: [{ label: "", size: 400, source: "catalog" }] }), "portion:0")!;
    expect(loggedPortionOf(1, unnamed)).toEqual({ amount: 1, amountUnit: "pack" });
  });

  it("labels the row with what was actually entered", () => {
    expect(loggedAmountLabel({ amount: 35, amountUnit: "g", qty: 0.35 }, words)).toBe("35 g");
    expect(loggedAmountLabel({ amount: 1, amountUnit: "bottle", qty: 4 }, words)).toBe("1 bottle");
    expect(loggedAmountLabel({ amount: 1, amountUnit: "pack", qty: 4 }, words)).toBe("1 pack");
  });

  it("stays silent when the bare number already reads correctly", () => {
    // Servings: the number beside the stepper has always meant servings.
    expect(loggedAmountLabel({ amount: 1.5, amountUnit: "serving", qty: 1.5 }, words)).toBeNull();
    // An entry from before this shipped, or a quick macro line.
    expect(loggedAmountLabel({ qty: 2 }, words)).toBeNull();
    expect(loggedAmountLabel({ amount: null, amountUnit: null, qty: 2 }, words)).toBeNull();
  });

  it("shows the amount when there is one, the quantity otherwise", () => {
    expect(loggedAmountShown({ amount: 35, amountUnit: "g", qty: 0.35 })).toBe(35);
    expect(loggedAmountShown({ qty: 0.35 })).toBe(0.35);
  });

  it("rescales the amount with the quantity, exactly", () => {
    expect(rescaleLoggedAmount(35, 0.35, 0.4)).toBe(40);
    expect(rescaleLoggedAmount(400, 4, 2)).toBe(200);
  });

  it("has no amount to rescale when none was recorded", () => {
    expect(rescaleLoggedAmount(null, 1, 2)).toBeNull();
    expect(rescaleLoggedAmount(35, 0, 2)).toBeNull();
  });
});

describe("stepLoggedPortion — the diary row's −/+", () => {
  it("steps a gram entry in grams, and moves the quantity with it", () => {
    expect(stepLoggedPortion({ amount: 35, amountUnit: "g", qty: 0.35 }, 1)).toEqual({ amount: 40, qty: 0.4 });
    expect(stepLoggedPortion({ amount: 35, amountUnit: "g", qty: 0.35 }, -1)).toEqual({ amount: 30, qty: 0.3 });
  });

  it("steps a pack entry by half a pack", () => {
    expect(stepLoggedPortion({ amount: 1, amountUnit: "bottle", qty: 4 }, -1)).toEqual({ amount: 0.5, qty: 2 });
  });

  it("keeps the half-serving grid for an entry with no amount", () => {
    expect(stepLoggedPortion({ qty: 1 }, 1)).toEqual({ amount: null, qty: 1.5 });
  });

  it("does NOT round an off-grid legacy quantity onto the grid", () => {
    // An entry logged before this shipped can still be a 0.35: the first press
    // must not turn a measured portion into half a serving.
    expect(stepLoggedPortion({ qty: 0.35 }, 1)).toEqual({ amount: null, qty: 0.85 });
  });

  it("respects the quantity ceiling through the entry's own unit", () => {
    const at = stepLoggedPortion({ amount: 5000, amountUnit: "g", qty: 50 }, 1);
    expect(at.qty).toBeLessThanOrEqual(50);
  });
});

describe("formatAmount", () => {
  it("prints without trailing zeros", () => {
    expect(formatAmount(35)).toBe("35");
    expect(formatAmount(0.35)).toBe("0.35");
    expect(formatAmount(1.5)).toBe("1.5");
  });
});
