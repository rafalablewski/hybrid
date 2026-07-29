import { describe, it, expect } from "vitest";
import { dailyNutrition, todayNutrition, estimateMaintenance, adaptiveTargets, nutritionSummary, nutritionNudge, sumMealComponents, fuelToday, resolveMealParts, mealPartKey, MAX_CUSTOM_MEAL_PARTS, derivedFoodEntries, parseDerivedEntryId, foodLogSignals, referenceIntakes, panelStatus, emptyNutritionDay } from "./nutrition";
import type { Signal } from "./signals";

const DAY = 86_400_000;
// LOCAL-constructed fixtures so same-day grouping holds in any timezone
// (nutrition days are the athlete's local calendar days).
const NOW = new Date(2026, 5, 3, 18).getTime();
const at = (daysAgo: number, hour = 12) => {
  const d = new Date(NOW - daysAgo * DAY);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour).toISOString();
};

const kcal = (v: number, daysAgo: number): Signal => ({ athleteId: "u", kind: "energyIntake", value: v, unit: "kcal", source: "manual", ts: at(daysAgo) });
const mass = (v: number, daysAgo: number): Signal => ({ athleteId: "u", kind: "bodyMass", value: v, unit: "kg", source: "manual", ts: at(daysAgo) });

describe("nutrition aggregation", () => {
  it("sums multiple entries on the same day", () => {
    const s: Signal[] = [
      { athleteId: "u", kind: "energyIntake", value: 600, unit: "kcal", source: "manual", ts: at(0, 8) },
      { athleteId: "u", kind: "energyIntake", value: 700, unit: "kcal", source: "manual", ts: at(0, 13) },
      { athleteId: "u", kind: "protein", value: 40, unit: "g", source: "manual", ts: at(0, 8) },
    ];
    const today = todayNutrition(s, NOW);
    expect(today.kcal).toBe(1300);
    expect(today.protein).toBe(40);
  });

  it("buckets by day, newest first", () => {
    const days = dailyNutrition([kcal(2000, 0), kcal(1800, 1)]);
    expect(days[0]!.date > days[1]!.date).toBe(true);
    expect(days).toHaveLength(2);
  });

  it("today is zero when nothing logged", () => {
    expect(todayNutrition([], NOW).kcal).toBe(0);
  });
});

describe("maintenance estimate (energy balance)", () => {
  it("≈ avg intake when weight is stable", () => {
    const s: Signal[] = [];
    for (let d = 0; d < 21; d++) s.push(kcal(2500, d));
    s.push(mass(80, 21), mass(80, 0)); // no change
    const e = estimateMaintenance(s, { now: NOW, days: 28 });
    expect(e.kcal).toBeCloseTo(2500, -2); // within ~100
    expect(e.basis).toMatch(/energy balance/);
  });

  it("is higher than intake when losing weight on a deficit", () => {
    const s: Signal[] = [];
    for (let d = 0; d < 27; d++) s.push(kcal(2000, d));
    s.push(mass(82, 26), mass(80, 0)); // −2 kg over ~26 d (inside the 28-day window)
    const e = estimateMaintenance(s, { now: NOW, days: 28 });
    expect(e.kcal!).toBeGreaterThan(2000);
    expect(e.weightChangeKg!).toBeLessThan(0);
  });

  it("falls back to a bodyweight estimate without intake history", () => {
    const e = estimateMaintenance([mass(80, 0)], { now: NOW });
    expect(e.kcal).toBe(Math.round(80 * 31));
    expect(e.basis).toMatch(/bodyweight/);
  });

  it("is null with no data and no bodyweight", () => {
    expect(estimateMaintenance([], { now: NOW }).kcal).toBeNull();
  });
});

describe("adaptive macro targets", () => {
  const stable: Signal[] = (() => {
    const s: Signal[] = [mass(80, 28), mass(80, 0)];
    for (let d = 0; d < 21; d++) s.push(kcal(2600, d));
    return s;
  })();

  it("orders deficit < maintenance < surplus", () => {
    const lose = adaptiveTargets(stable, { goal: "lose", now: NOW });
    const maint = adaptiveTargets(stable, { goal: "maintain", now: NOW });
    const gain = adaptiveTargets(stable, { goal: "gain", now: NOW });
    expect(lose.kcal).toBeLessThan(maint.kcal);
    expect(maint.kcal).toBeLessThan(gain.kcal);
  });

  it("sets protein from bodyweight and macros sum into kcal", () => {
    const t = adaptiveTargets(stable, { goal: "lose", now: NOW });
    expect(t.protein).toBe(Math.round(80 * 2.2));
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    expect(Math.abs(fromMacros - t.kcal)).toBeLessThan(40); // rounding only
  });

  it("uses a sane default when cold-start", () => {
    const t = adaptiveTargets([], { goal: "maintain", now: NOW });
    expect(t.kcal).toBeGreaterThan(1200);
    expect(t.basis).toMatch(/default/);
  });

  it("adds training fuel entirely as carbs, leaving protein and fat", () => {
    const rest = adaptiveTargets(stable, { goal: "maintain", now: NOW });
    const trained = adaptiveTargets(stable, { goal: "maintain", now: NOW, trainingKcal: 400 });
    expect(rest.trainingKcal).toBe(0);
    expect(trained.trainingKcal).toBe(400);
    expect(trained.kcal).toBe(rest.kcal + 400);
    expect(trained.carbs).toBe(rest.carbs + 100); // 400 kcal / 4
    expect(trained.protein).toBe(rest.protein);
    expect(trained.fat).toBe(rest.fat);
  });
});

describe("nutritionSummary", () => {
  const prot = (v: number, daysAgo: number): Signal => ({ athleteId: "u", kind: "protein", value: v, unit: "g", source: "manual", ts: at(daysAgo) });

  it("returns an empty summary when nothing is logged", () => {
    const s = nutritionSummary([], { now: NOW });
    expect(s.loggedDays).toBe(0);
    expect(s.avgKcal).toBeNull();
    expect(s.macroSplit).toBeNull();
    expect(s.adherencePct).toBeNull();
  });

  it("averages only over days that recorded intake, within the window", () => {
    const signals = [kcal(2000, 0), kcal(2200, 1), kcal(1800, 2), kcal(9999, 45)]; // last is outside 30d
    const s = nutritionSummary(signals, { now: NOW, windowDays: 30 });
    expect(s.loggedDays).toBe(3);
    expect(s.avgKcal).toBe(2000);
  });

  it("computes adherence + protein-hit against targets and a macro split", () => {
    const targets = { kcal: 2000, protein: 150, carbs: 200, fat: 60, maintenance: 2000, goal: "maintain" as const, basis: "x", trainingKcal: 0 };
    // day0 on target + protein hit; day1 way over (out of band) and protein short
    const signals = [kcal(2000, 0), prot(150, 0), kcal(2600, 1), prot(80, 1)];
    const s = nutritionSummary(signals, { now: NOW, targets, windowDays: 30 });
    expect(s.loggedDays).toBe(2);
    expect(s.adherencePct).toBe(50); // 1 of 2 days within ±10%
    expect(s.proteinHitDays).toBe(1);
    expect(s.macroSplit).not.toBeNull();
    expect(s.macroSplit!.protein + s.macroSplit!.carbs + s.macroSplit!.fat).toBeGreaterThan(95);
  });
});

describe("nutritionNudge", () => {
  const targets = { kcal: 2400, protein: 160, carbs: 300, fat: 70, maintenance: 2400, goal: "maintain" as const, basis: "x", trainingKcal: 0 };
  // Built from emptyNutritionDay so a new NutritionDay field can never leave
  // this fixture behind — which is exactly what happened when the label panel
  // landed: vitest strips types rather than checking them, so the suite stayed
  // green while `tsc --noEmit` failed.
  const day = (kcalV: number, proteinV: number): ReturnType<typeof todayNutrition> =>
    ({ ...emptyNutritionDay("2026-06-03"), kcal: kcalV, protein: proteinV });

  it("flags a cold start when nothing is logged", () => {
    expect(nutritionNudge(day(0, 0), targets).kind).toBe("cold-start");
  });
  it("prioritises a protein shortfall", () => {
    const n = nutritionNudge(day(1600, 100), targets);
    expect(n.kind).toBe("protein");
    expect(n.gap).toBe(60);
  });
  it("reports calories left when protein is close", () => {
    const n = nutritionNudge(day(1600, 155), targets);
    expect(n.kind).toBe("calories-left");
    expect(n.gap).toBe(800);
  });
  it("flags going over target", () => {
    expect(nutritionNudge(day(2800, 170), targets).kind).toBe("over");
  });
  it("says on-track when close on both", () => {
    expect(nutritionNudge(day(2350, 158), targets).kind).toBe("on-track");
  });
});

describe("fuelToday (Today widget state)", () => {
  // Pin targets: one bodyweight reading and no weight trend → the bw estimate
  // (80 × 31 = 2480 kcal), goal maintain → protein 144 g, carbs 321, fat 69.
  const bw = mass(80, 0);
  const p = (v: number, daysAgo = 0): Signal => ({ athleteId: "u", kind: "protein", value: v, unit: "g", source: "manual", ts: at(daysAgo) });
  const c = (v: number, daysAgo = 0): Signal => ({ athleteId: "u", kind: "carbs", value: v, unit: "g", source: "manual", ts: at(daysAgo) });
  const f = (v: number, daysAgo = 0): Signal => ({ athleteId: "u", kind: "fat", value: v, unit: "g", source: "manual", ts: at(daysAgo) });

  it("is empty when nothing is logged today", () => {
    const fuel = fuelToday([bw], { now: NOW });
    expect(fuel.state).toBe("empty");
    expect(fuel.kcalPct).toBe(0);
    expect(fuel.trained).toBe(false);
  });

  it("reads goal-hit once every macro is ≥95% of target", () => {
    const fuel = fuelToday([bw, kcal(2480, 0), p(140, 0), c(315, 0), f(68, 0)], { now: NOW });
    expect(fuel.allMacrosHit).toBe(true);
    expect(fuel.state).toBe("goal-hit");
  });

  it("nudges protein on a rest day when ≥20 g short", () => {
    const fuel = fuelToday([bw, kcal(1500, 0), p(100, 0), c(150, 0), f(40, 0)], { now: NOW });
    expect(fuel.proteinGap).toBeGreaterThanOrEqual(20);
    expect(fuel.state).toBe("protein");
    expect(fuel.trained).toBe(false);
  });

  it("flips the SAME short day to refuel once trained, lifting the carb target", () => {
    const base = [bw, kcal(1500, 0), p(100, 0), c(150, 0), f(40, 0)];
    const rest = fuelToday(base, { now: NOW });
    const trained = fuelToday(base, { now: NOW, trainingKcal: 600 });
    expect(trained.state).toBe("refuel");
    expect(trained.trained).toBe(true);
    expect(trained.targets.carbs).toBeGreaterThan(rest.targets.carbs);
  });

  it("is on-track when within range with no urgent gap", () => {
    const fuel = fuelToday([bw, kcal(2400, 0), p(130, 0), c(200, 0), f(40, 0)], { now: NOW });
    expect(fuel.state).toBe("on-track");
  });

  it("flags over when past 110% of the calorie target", () => {
    const fuel = fuelToday([bw, kcal(3000, 0), p(140, 0), c(200, 0), f(40, 0)], { now: NOW });
    expect(fuel.state).toBe("over");
    expect(fuel.kcalLeft).toBeLessThan(0);
  });

  it("marks a macro that surpasses its target with over + overBy", () => {
    // protein target is 144 g (80 kg × 1.8); log 170 → over by 26.
    const fuel = fuelToday([bw, kcal(2000, 0), p(170, 0), c(150, 0), f(40, 0)], { now: NOW });
    expect(fuel.macros.protein.over).toBe(true);
    expect(fuel.macros.protein.overBy).toBe(26);
    expect(fuel.macros.protein.pct).toBe(100); // still clamped for the bar
    // a macro under target is not over
    expect(fuel.macros.carbs.over).toBe(false);
    expect(fuel.macros.carbs.overBy).toBe(0);
  });
});

describe("sumMealComponents (meal built from products)", () => {
  it("sums each product's macros scaled by its serving count, rounded", () => {
    const total = sumMealComponents([
      { kcal: 165, protein: 31, carbs: 0, fat: 3.6, qty: 2 }, // 2× chicken
      { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, qty: 1 }, // 1× rice
    ]);
    expect(total).toEqual({ kcal: 460, protein: 65, carbs: 28, fat: 8 });
  });
  it("treats a non-positive qty as a single serving", () => {
    const total = sumMealComponents([{ kcal: 100, protein: 10, carbs: 5, fat: 2, qty: 0 }]);
    expect(total).toEqual({ kcal: 100, protein: 10, carbs: 5, fat: 2 });
  });
  it("is zero for an empty meal", () => {
    expect(sumMealComponents([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe("meal parts (custom parts of the day)", () => {
  const tMeal = (k: string) => ({ breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" }[k] ?? k);
  it("returns the four built-ins (localized) when there are no custom parts", () => {
    const parts = resolveMealParts([], tMeal);
    expect(parts.map((p) => p.key)).toEqual(["breakfast", "lunch", "dinner", "snack"]);
    expect(parts.every((p) => !p.custom)).toBe(true);
    expect(parts[0]!.label).toBe("Breakfast");
  });
  it("appends custom parts after the built-ins", () => {
    const parts = resolveMealParts([{ key: "pre-workout", label: "Pre-workout" }], tMeal);
    expect(parts).toHaveLength(5);
    expect(parts[4]).toEqual({ key: "pre-workout", label: "Pre-workout", custom: true });
  });
  it("drops a custom part that collides with a built-in key", () => {
    const parts = resolveMealParts([{ key: "lunch", label: "Lunch again" }], tMeal);
    expect(parts).toHaveLength(4);
  });
  it("caps the number of custom parts", () => {
    const many = Array.from({ length: MAX_CUSTOM_MEAL_PARTS + 3 }, (_, i) => ({ key: `p${i}`, label: `P${i}` }));
    const parts = resolveMealParts(many, tMeal);
    expect(parts).toHaveLength(4 + MAX_CUSTOM_MEAL_PARTS);
  });
  it("slugs a typed label into a stable key", () => {
    expect(mealPartKey("  Pre-Workout!  ")).toBe("pre-workout");
    expect(mealPartKey("Second Breakfast")).toBe("second-breakfast");
  });
});

describe("derived diary entries (rebuilt from Signals)", () => {
  const sig = (id: string, kind: string, value: number, source: string, ts: string) =>
    ({ id, kind, value, source, ts });

  it("groups the four Signals of one log into a single editable entry", () => {
    const ts = at(0, 8);
    const entries = derivedFoodEntries([
      sig("a", "energyIntake", 520, "breakfast", ts),
      sig("b", "protein", 32, "breakfast", ts),
      sig("c", "carbs", 55, "breakfast", ts),
      sig("d", "fat", 18, "breakfast", ts),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: "breakfast", kcal: 520, protein: 32, carbs: 55, fat: 18, qty: 1, derived: true });
    expect(parseDerivedEntryId(entries[0]!.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps logs at different instants or parts apart, newest first", () => {
    const entries = derivedFoodEntries([
      sig("a", "energyIntake", 300, "breakfast", at(0, 8)),
      sig("b", "energyIntake", 700, "lunch", at(0, 13)),
      sig("c", "energyIntake", 250, "breakfast", at(0, 9)),
    ]);
    expect(entries.map((e) => e.kcal)).toEqual([700, 250, 300]);
  });

  it("skips Signals a FoodLog row already owns, and empty groups", () => {
    const ts = at(0, 8);
    const entries = derivedFoodEntries(
      [
        sig("a", "energyIntake", 520, "breakfast", ts),
        sig("b", "energyIntake", 400, "lunch", at(0, 13)),
        sig("z", "bodyMass", 82, "manual", ts),
      ],
      { exclude: ["a"] },
    );
    expect(entries.map((e) => e.kcal)).toEqual([400]);
  });

  it("accepts Date timestamps and non-part sources (manual, off, preset)", () => {
    const d = new Date(NOW);
    const entries = derivedFoodEntries([
      { id: "a", kind: "energyIntake", value: 210, source: "off", ts: d },
      { id: "b", kind: "protein", value: 20, source: "off", ts: d },
    ]);
    expect(entries[0]).toMatchObject({ source: "off", kcal: 210, protein: 20, ts: d.toISOString() });
  });

  it("only treats sig: ids as derived, and rejects malformed ones", () => {
    expect(parseDerivedEntryId("clx123abc")).toBeNull();
    expect(parseDerivedEntryId("sig:")).toBeNull();
    expect(parseDerivedEntryId("sig:a.b")).toEqual(["a", "b"]);
    expect(parseDerivedEntryId("sig:a/../b")).toBeNull();
    // Over-long ids are still refused — the cap just moved, because one log now
    // writes eight readings rather than four (see MAX_DERIVED_SIGNALS).
    expect(parseDerivedEntryId(`sig:${Array.from({ length: 40 }, (_, i) => `x${i}`).join(".")}`)).toBeNull();
  });
});

describe("derived entry ids survive the label panel", () => {
  it("addresses all EIGHT signals one log now writes", () => {
    // The regression this guards: a log used to write 4 readings and the id cap
    // was 8. With the label panel a log writes 8, so a cap of 8 left no room —
    // and an id over the cap parses as null, which makes that Diary entry
    // permanently uneditable and undeletable.
    const ids = ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"];
    expect(parseDerivedEntryId(`sig:${ids.join(".")}`)).toEqual(ids);
  });

  it("addresses several foods that collided on one exact instant", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `id${i}`);
    expect(parseDerivedEntryId(`sig:${ids.join(".")}`)).toHaveLength(24);
  });

  it("still refuses an id long enough to be junk", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `id${i}`);
    expect(parseDerivedEntryId(`sig:${ids.join(".")}`)).toBeNull();
  });

  it("round-trips a full panel log end to end", () => {
    // foodLogSignals → Signals → derivedFoodEntries → parseDerivedEntryId
    const ts = "2026-07-29T12:00:00.000Z";
    const written = foodLogSignals(
      { kcal: 327, protein: 14.2, carbs: 22.9, fat: 19.6, satFat: 7.3, sugar: 4.1, fiber: null, salt: 1.7 },
      1,
    );
    expect(written).toHaveLength(7); // fibre wasn't stated, so it writes nothing
    const rows = written.map((w, i) => ({ id: `s${i}`, kind: w.kind, value: w.value, source: "lunch", ts }));
    const [entry] = derivedFoodEntries(rows);
    expect(entry).toBeDefined();
    expect(entry!.satFat).toBe(7.3);
    expect(entry!.fiber).toBeNull();
    expect(parseDerivedEntryId(entry!.id)).toHaveLength(7);
  });
});

describe("reference intakes for the label panel", () => {
  it("scales saturates and sugars with the athlete's energy, and salt not at all", () => {
    // A 4 000 kcal training day does NOT earn more salt — that is a flat
    // physiological ceiling, not a share of energy. Saturates and sugars are
    // shares, so an athlete eating for training is not "over" at the same grams
    // a sedentary adult would be.
    const small = referenceIntakes(2000);
    const big = referenceIntakes(4000);
    expect(small.satFat).toBe(22); // 10% of 2000 kcal ÷ 9
    expect(big.satFat).toBe(44);
    expect(small.sugar).toBe(50); // 10% of 2000 kcal ÷ 4
    expect(big.sugar).toBe(100);
    expect(small.salt).toBe(5);
    expect(big.salt).toBe(5);
  });

  it("treats fibre as a floor to reach, at a flat 30 g", () => {
    expect(referenceIntakes(2000).fiber).toBe(30);
    expect(referenceIntakes(4000).fiber).toBe(30);
  });

  it("falls back to 2 000 kcal rather than dividing by a nonsense target", () => {
    expect(referenceIntakes(0)).toEqual(referenceIntakes(2000));
    expect(referenceIntakes(Number.NaN)).toEqual(referenceIntakes(2000));
  });
});

describe("panelStatus", () => {
  const day = { ...emptyNutritionDay("2026-07-29"), satFat: 30, sugar: 20, fiber: 12, salt: 7 };

  it("flags the three ceilings only once passed", () => {
    const st = panelStatus(day, 2000);
    const by = Object.fromEntries(st.map((r) => [r.key, r]));
    expect(by.satFat!.over).toBe(true); // 30 g against a 22 g reference
    expect(by.salt!.over).toBe(true); // 7 g against 5 g
    expect(by.sugar!.over).toBe(false); // 20 g against 50 g
  });

  it("never flags fibre as a breach — it is the one to reach", () => {
    const fiber = panelStatus(day, 2000).find((r) => r.key === "fiber")!;
    expect(fiber.floor).toBe(true);
    expect(fiber.over).toBe(false);
    expect(fiber.pct).toBeCloseTo(0.4); // 12 of 30 g
  });

  it("moves the ceiling when the athlete eats more", () => {
    const at4k = panelStatus(day, 4000).find((r) => r.key === "satFat")!;
    expect(at4k.reference).toBe(44);
    expect(at4k.over).toBe(false); // the same 30 g is fine on a 4 000 kcal day
  });

  it("reports zeros without dividing by zero", () => {
    for (const r of panelStatus(emptyNutritionDay("2026-07-29"), 2000)) {
      expect(r.pct).toBe(0);
      expect(r.over).toBe(false);
    }
  });
});
