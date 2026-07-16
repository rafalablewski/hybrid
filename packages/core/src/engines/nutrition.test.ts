import { describe, it, expect } from "vitest";
import { dailyNutrition, todayNutrition, estimateMaintenance, adaptiveTargets } from "./nutrition";
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
