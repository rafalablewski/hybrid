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
  portionUnitId,
  namedPortionUnits,
  oneOfPortion,
  removeFoodPortion,
  usualAmounts,
  usualLogPortion,
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
    expect(units.map((u) => u.id)).toEqual(["servings", "measure", "portion:bottle|400"]);
    const bottle = portionUnit(units, "portion:bottle|400")!;
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
        { label: "slice", size: 25, source: "typed" },
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
    expect(portionUnit(units, "portion:bottle|400")!.portionLabel).toBe("bottle");
  });

  it("keys a portion by WHAT IT IS, so adding one cannot re-point the selection", () => {
    const before = portionUnits({ serving: "100 g", portions: [{ label: "block", size: 200, source: "typed" }] });
    // A smaller portion arrives and sorts in FRONT of the block.
    const after = portionUnits({ serving: "100 g", portions: [
      { label: "block", size: 200, source: "typed" },
      { label: "slice", size: 25, source: "typed" },
    ] });
    const selected = before.at(-1)!.id;
    expect(portionUnit(after, selected)!.portionLabel).toBe("block");
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

describe("removeFoodPortion — taking a pack back off a food", () => {
  const bottle = { label: "bottle", size: 400, source: "catalog" as const };
  const glass = { label: "glass", size: 250, source: "typed" as const };

  it("drops the portion its unit id names and leaves the rest", () => {
    expect(removeFoodPortion([bottle, glass], portionUnitId(bottle))).toEqual([glass]);
  });

  it("removes by identity, not by position — the list re-sorts on every write", () => {
    // Sorted smallest-first, `glass` is index 0 and `bottle` index 1; adding a
    // 100 g portion would move both. The id survives that, an index would not.
    const after = removeFoodPortion([bottle, glass, { label: "", size: 100, source: "typed" }], portionUnitId(glass));
    expect(after.map((p) => p.label)).toEqual(["", "bottle"]);
  });

  it("is a no-op for an id no portion holds", () => {
    expect(removeFoodPortion([bottle], "portion:tub|900")).toEqual([bottle]);
    expect(removeFoodPortion([bottle], "measure")).toEqual([bottle]);
  });

  it("empties the switch when the last pack goes", () => {
    expect(removeFoodPortion([bottle], portionUnitId(bottle))).toEqual([]);
    expect(portionUnits({ serving: "100 g", portions: [] }).some((u) => u.kind === "portion")).toBe(false);
  });

  it("takes the food's whole folded list, legacy pack included", () => {
    // What the caller must pass: `foodPortions` folds the legacy column in, so
    // filtering the STORED list alone would delete a legacy pack only until the
    // next read (the caller clears packSize/packLabel in the same write).
    const legacy = { serving: "100 g", portions: [bottle], packSize: 250, packLabel: "glass" };
    const folded = foodPortions(legacy);
    expect(folded).toHaveLength(2);
    expect(removeFoodPortion(folded, "portion:glass|250")).toEqual([bottle]);
  });
});

describe("namedPortionUnits — the packs a row can offer", () => {
  it("is the packs alone: not servings, not the measure", () => {
    expect(namedPortionUnits(KEFIR).map((u) => u.portionLabel)).toEqual(["bottle"]);
  });

  it("is empty for a food that has none", () => {
    expect(namedPortionUnits({ serving: "100 g" })).toEqual([]);
    expect(namedPortionUnits({})).toEqual([]);
  });
});

describe("oneOfPortion — the whole bottle, in one tap", () => {
  it("writes the quantity the macros scale by AND the portion as entered", () => {
    const bottle = namedPortionUnits(KEFIR)[0]!;
    expect(oneOfPortion(bottle)).toEqual({ qty: 4, amount: 1, amountUnit: "bottle" });
  });

  it("falls back to the canonical pack token when the container has no name", () => {
    const pack = namedPortionUnits({ serving: "100 g", portions: [{ label: "", size: 150, source: "typed" }] })[0]!;
    expect(oneOfPortion(pack)).toEqual({ qty: 1.5, amount: 1, amountUnit: "pack" });
  });

  it("agrees with the sheet: one of a unit is what the stepper would log at 1", () => {
    const bottle = namedPortionUnits(KEFIR)[0]!;
    expect(oneOfPortion(bottle).qty).toBe(portionQty(1, bottle));
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
  const pack = portionUnit(units, "portion:bottle|400")!;

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

  // ── A PORTION IS COUNTABLE, so it is the one unit that always snaps.
  it("SNAPS a portion onto its grid — a container is counted, not weighed", () => {
    const bottle = portionUnit(portionUnits(KEFIR), "portion:bottle|400")!;
    // 0.25 is not a weighing; it is what switching a 100 g serving to a 400 g
    // bottle leaves behind. Without the snap the grid is offset by a quarter for
    // good and ONE WHOLE BOTTLE is unreachable by pressing +.
    expect(portionStep(0.25, bottle, 1)).toBe(0.5);
    expect(portionStep(0.5, bottle, 1)).toBe(1);
    expect(portionStep(1.25, bottle, -1)).toBe(1);
  });

  it("and the snap does not leak onto the units that hold a measured amount", () => {
    expect(portionStep(0.35, servings, 1)).toBe(0.85);
    expect(portionStep(37, measure, 1)).toBe(42);
  });

  it("one whole bottle is reachable from a unit switch in two presses", () => {
    const units2 = portionUnits(KEFIR);
    const bottle = portionUnit(units2, "portion:bottle|400")!;
    const measure2 = portionUnit(units2, "measure")!;
    // What the sheet does: opens on the measure, athlete taps the bottle chip.
    const carried = portionAmount(portionQty(measure2.initial, measure2), bottle);
    expect(carried).toBe(0.25);
    expect(portionStep(portionStep(carried, bottle, 1), bottle, 1)).toBe(1);
  });
});

describe("portionEquivalent — the line under the stepper", () => {
  const units = portionUnits(KEFIR);

  it("says what a servings count weighs", () => {
    expect(portionEquivalent(1.5, portionUnit(units, "servings")!, units)).toEqual({ amount: 150, symbol: "g" });
  });

  it("says what a pack weighs", () => {
    expect(portionEquivalent(1, portionUnit(units, "portion:bottle|400")!, units)).toEqual({ amount: 400, symbol: "g" });
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
  const pack = portionUnit(units, "portion:bottle|400")!;
  const words = { pack: "pack" };

  it("writes the amount in the unit it was entered in", () => {
    expect(loggedPortionOf(35, measure)).toEqual({ amount: 35, amountUnit: "g" });
    expect(loggedPortionOf(1, pack)).toEqual({ amount: 1, amountUnit: "bottle" });
    expect(loggedPortionOf(1.5, servings)).toEqual({ amount: 1.5, amountUnit: "serving" });
  });

  it("stores a CANONICAL token for an unnamed pack, never a translated word", () => {
    const unnamed = portionUnit(portionUnits({ serving: "100 g", portions: [{ label: "", size: 400, source: "catalog" }] }), "portion:|400")!;
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

describe("the sources that are actually reachable", () => {
  it("has no source nothing can produce", () => {
    // "learned" was in this union for one commit and nothing ever wrote it: a
    // learned amount is a prefill, not a named portion. A value the type allows
    // and no code can create is an invitation to write it by accident.
    expect(parseFoodPortions([{ label: "x", size: 10, source: "learned" }])[0]!.source).toBe("typed");
    expect(parseFoodPortions([{ label: "x", size: 10, source: "catalog" }])[0]!.source).toBe("catalog");
    expect(parseFoodPortions([{ label: "x", size: 10, source: "scanned" }])[0]!.source).toBe("scanned");
  });
});

describe("usualLogPortion — what a one-tap ⊕ should write", () => {
  const usual = { amount: 35, unit: "g", times: 4 };

  it("logs the habit, converted to the diary's quantity", () => {
    expect(usualLogPortion({ serving: "100 g" }, usual))
      .toEqual({ qty: 0.35, amount: 35, amountUnit: "g" });
  });

  it("has nothing to say without a habit", () => {
    expect(usualLogPortion({ serving: "100 g" }, null)).toBeNull();
  });

  it("declines when the food's measure moved out from under the habit", () => {
    // The serving was edited from grams to a bare count, or to millilitres.
    expect(usualLogPortion({ serving: "1 slice" }, usual)).toBeNull();
    expect(usualLogPortion({ serving: "250 ml" }, usual)).toBeNull();
  });
});
