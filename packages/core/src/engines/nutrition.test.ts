import { describe, it, expect } from "vitest";
import { dailyNutrition, todayNutrition, estimateMaintenance, adaptiveTargets, nutritionSummary, nutritionNudge } from "./nutrition";
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
    const targets = { kcal: 2000, protein: 150, carbs: 200, fat: 60, maintenance: 2000, goal: "maintain" as const, basis: "x" };
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
  const targets = { kcal: 2400, protein: 160, carbs: 300, fat: 70, maintenance: 2400, goal: "maintain" as const, basis: "x" };
  const day = (kcalV: number, proteinV: number): ReturnType<typeof todayNutrition> => ({ date: "2026-06-03", kcal: kcalV, protein: proteinV, carbs: 0, fat: 0, water: 0 });

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
