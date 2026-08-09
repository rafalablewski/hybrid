import { describe, expect, it } from "vitest";
import {
  MIN_DAYS_FOR_INSIGHT,
  NUTRIENT_KEYS,
  nutritionAnalytics,
  type NutritionInsightKind,
} from "./nutrition-analytics";
import type { Signal } from "./engines/signals";
import type { LoggedSession } from "./engines/session";

const NOW = new Date(2026, 5, 30, 18, 0, 0).getTime(); // Tue 30 Jun 2026, evening

/** A local ISO string n days before NOW, at midday. */
const dayAgo = (n: number, hour = 12) => {
  const d = new Date(NOW);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, hour, 0, 0, 0).toISOString();
};

const sig = (kind: Signal["kind"], value: number, ts: string): Signal => ({
  athleteId: "a", kind, value, unit: "", source: "manual", ts,
});

/** A logged day n days ago. Panel fields are only written when passed —
 *  absence is the whole point of the not-stated handling. */
const day = (
  n: number,
  v: { kcal: number; protein: number; carbs?: number; fat?: number; fiber?: number; sugar?: number; salt?: number; satFat?: number; water?: number },
): Signal[] => {
  const ts = dayAgo(n);
  const out: Signal[] = [
    sig("energyIntake", v.kcal, ts),
    sig("protein", v.protein, ts),
    sig("carbs", v.carbs ?? 200, ts),
    sig("fat", v.fat ?? 70, ts),
  ];
  if (v.fiber != null) out.push(sig("fiber", v.fiber, ts));
  if (v.sugar != null) out.push(sig("sugar", v.sugar, ts));
  if (v.salt != null) out.push(sig("salt", v.salt, ts));
  if (v.satFat != null) out.push(sig("satFat", v.satFat, ts));
  if (v.water != null) out.push(sig("water", v.water, ts));
  return out;
};

const session = (n: number): LoggedSession => ({
  id: `s${n}`,
  startedAt: dayAgo(n, 9),
  blocks: [{ kind: "cardio", name: "Run", minutes: 45, distanceKm: 8 } as never],
} as unknown as LoggedSession);

const kinds = (a: { insights: { kind: NutritionInsightKind }[] }) => a.insights.map((i) => i.kind);

describe("nutritionAnalytics — shape", () => {
  it("covers the whole window, oldest first, including unlogged days", () => {
    const a = nutritionAnalytics(day(1, { kcal: 2000, protein: 150 }), { windowDays: 7, now: NOW });
    expect(a.days).toHaveLength(7);
    expect(a.days[0]! < a.days[6]!).toBe(true);
    expect(a.loggedDays).toBe(1);
  });

  it("returns a stat for every nutrient, series aligned to the days", () => {
    const a = nutritionAnalytics(day(1, { kcal: 2000, protein: 150 }), { windowDays: 7, now: NOW });
    for (const k of NUTRIENT_KEYS) {
      expect(a.nutrients[k]).toBeDefined();
      expect(a.nutrients[k].series).toHaveLength(7);
    }
  });

  it("averages the required macros over LOGGED days, not over the window", () => {
    const signals = [...day(1, { kcal: 2000, protein: 100 }), ...day(2, { kcal: 3000, protein: 200 })];
    const a = nutritionAnalytics(signals, { windowDays: 30, now: NOW });
    // Two logged days out of thirty — the average is of the two, not of thirty.
    expect(a.nutrients.kcal.avg).toBe(2500);
    expect(a.nutrients.protein.avg).toBe(150);
  });
});

describe("the zeros problem", () => {
  it("does not average a panel nutrient across days that never stated it", () => {
    const signals = [
      ...day(1, { kcal: 2000, protein: 150, fiber: 30 }),
      ...day(2, { kcal: 2000, protein: 150 }), // no fibre stated
      ...day(3, { kcal: 2000, protein: 150 }), // no fibre stated
    ];
    const a = nutritionAnalytics(signals, { windowDays: 7, now: NOW });
    // Naive averaging would give 10 g. The honest answer is 30 from one day.
    expect(a.nutrients.fiber.avg).toBe(30);
    expect(a.nutrients.fiber.statedDays).toBe(1);
    expect(a.loggedDays).toBe(3);
  });

  it("marks unstated days as null in the series rather than as zero", () => {
    const signals = [...day(1, { kcal: 2000, protein: 150, salt: 6 }), ...day(2, { kcal: 2000, protein: 150 })];
    const a = nutritionAnalytics(signals, { windowDays: 7, now: NOW });
    const stated = a.nutrients.salt.series.filter((v) => v != null);
    expect(stated).toEqual([6]);
    expect(a.nutrients.salt.series.filter((v) => v === 0)).toEqual([]);
  });

  it("reports no average at all when nothing states a nutrient", () => {
    const a = nutritionAnalytics(day(1, { kcal: 2000, protein: 150 }), { windowDays: 7, now: NOW });
    expect(a.nutrients.sugar.avg).toBeNull();
    expect(a.nutrients.sugar.statedDays).toBe(0);
  });

  it("treats an unlogged water day as unknown, not as a dry day", () => {
    const signals = [...day(1, { kcal: 2000, protein: 150, water: 2500 }), ...day(2, { kcal: 2000, protein: 150 })];
    const a = nutritionAnalytics(signals, { windowDays: 7, now: NOW });
    expect(a.nutrients.water.avg).toBe(2500);
    expect(a.nutrients.water.statedDays).toBe(1);
  });
});

describe("targets and their kinds", () => {
  it("gives the macros a target, the panel ceilings, and fibre a floor", () => {
    const a = nutritionAnalytics(day(1, { kcal: 2000, protein: 150 }), { windowDays: 7, now: NOW });
    expect(a.nutrients.kcal.kind).toBe("target");
    expect(a.nutrients.protein.kind).toBe("target");
    expect(a.nutrients.water.kind).toBe("target");
    expect(a.nutrients.salt.kind).toBe("ceiling");
    expect(a.nutrients.sugar.kind).toBe("ceiling");
    expect(a.nutrients.satFat.kind).toBe("ceiling");
    expect(a.nutrients.fiber.kind).toBe("floor");
  });

  it("computes the share of target only when both figures exist", () => {
    const a = nutritionAnalytics(day(1, { kcal: 2000, protein: 150 }), { windowDays: 7, now: NOW });
    expect(a.nutrients.kcal.pctOfTarget).toBeGreaterThan(0);
    expect(a.nutrients.sugar.pctOfTarget).toBeNull(); // no average to compare
  });
});

describe("trend", () => {
  const rising = () => {
    const out: Signal[] = [];
    // 14 days, protein climbing 100 → 200.
    for (let n = 13; n >= 0; n--) out.push(...day(n, { kcal: 2400, protein: 100 + (13 - n) * 8 }));
    return out;
  };

  it("names a direction and its magnitude", () => {
    const a = nutritionAnalytics(rising(), { windowDays: 14, now: NOW });
    expect(a.nutrients.protein.trend?.direction).toBe("up");
    expect(a.nutrients.protein.trend!.pct).toBeGreaterThan(20);
  });

  it("calls a steady window flat rather than inventing movement", () => {
    const flat: Signal[] = [];
    for (let n = 13; n >= 0; n--) flat.push(...day(n, { kcal: 2400, protein: 160 }));
    const a = nutritionAnalytics(flat, { windowDays: 14, now: NOW });
    expect(a.nutrients.protein.trend?.direction).toBe("flat");
  });

  it("refuses a trend from too few days", () => {
    const a = nutritionAnalytics(day(1, { kcal: 2000, protein: 150 }), { windowDays: 30, now: NOW });
    expect(a.nutrients.protein.trend).toBeNull();
  });
});

describe("insights", () => {
  it("says only that logging is sparse when the window is too thin", () => {
    const a = nutritionAnalytics(day(1, { kcal: 2000, protein: 150 }), { windowDays: 30, now: NOW });
    expect(kinds(a)).toEqual(["logging-sparse"]);
    expect(a.insights[0]!.value).toBe(1);
  });

  it("reports eating materially under the calorie target", () => {
    const signals: Signal[] = [];
    for (let n = 6; n >= 0; n--) signals.push(...day(n, { kcal: 1400, protein: 150 }));
    const a = nutritionAnalytics(signals, { windowDays: 7, now: NOW, bodyMassKg: 85 });
    expect(kinds(a)).toContain("kcal-under");
    expect(a.insights.find((i) => i.kind === "kcal-under")!.value).toBeGreaterThan(5);
  });

  it("reports landing inside the band as on track", () => {
    const signals: Signal[] = [];
    const a0 = nutritionAnalytics([], { windowDays: 7, now: NOW, bodyMassKg: 80 });
    const target = a0.targets.kcal;
    for (let n = 6; n >= 0; n--) signals.push(...day(n, { kcal: target, protein: 200 }));
    const a = nutritionAnalytics(signals, { windowDays: 7, now: NOW, bodyMassKg: 80 });
    expect(kinds(a)).toContain("kcal-on-track");
  });

  it("reports protein short of target", () => {
    const signals: Signal[] = [];
    for (let n = 6; n >= 0; n--) signals.push(...day(n, { kcal: 2400, protein: 60 }));
    const a = nutritionAnalytics(signals, { windowDays: 7, now: NOW, bodyMassKg: 85 });
    expect(kinds(a)).toContain("protein-short");
  });

  it("finds the REST-DAY protein gap when sessions are known", () => {
    const signals: Signal[] = [];
    const sessions: LoggedSession[] = [];
    // Six days: trained on three (protein 190), rested on three (protein 110).
    for (let n = 5; n >= 0; n--) {
      const trained = n % 2 === 0;
      signals.push(...day(n, { kcal: 2600, protein: trained ? 190 : 110 }));
      if (trained) sessions.push(session(n));
    }
    const a = nutritionAnalytics(signals, { windowDays: 7, now: NOW, sessions, bodyMassKg: 85 });
    const gap = a.insights.find((i) => i.kind === "protein-rest-gap");
    expect(gap).toBeDefined();
    expect(gap!.value).toBe(110); // rest-day average
    expect(gap!.value2).toBe(190); // training-day average
  });

  it("does NOT guess the rest-day gap without session data", () => {
    const signals: Signal[] = [];
    for (let n = 5; n >= 0; n--) signals.push(...day(n, { kcal: 2600, protein: n % 2 === 0 ? 190 : 110 }));
    const a = nutritionAnalytics(signals, { windowDays: 7, now: NOW, bodyMassKg: 85 });
    expect(kinds(a)).not.toContain("protein-rest-gap");
  });

  it("reports thin panel coverage instead of a confident panel figure", () => {
    const signals: Signal[] = [];
    for (let n = 9; n >= 0; n--) signals.push(...day(n, { kcal: 2400, protein: 160 }));
    // Salt stated on one day out of ten.
    signals.push(sig("salt", 12, dayAgo(3)));
    const a = nutritionAnalytics(signals, { windowDays: 14, now: NOW, bodyMassKg: 85 });
    const cov = a.insights.find((i) => i.kind === "coverage-low" && i.nutrient === "salt");
    expect(cov).toBeDefined();
    expect(cov!.value).toBe(1);
    expect(cov!.value2).toBe(10);
    // …and NOT a salt-high claim built from one day.
    expect(a.insights.find((i) => i.kind === "salt-high")).toBeUndefined();
  });

  it("reports a breached ceiling once the coverage supports it", () => {
    const signals: Signal[] = [];
    for (let n = 9; n >= 0; n--) signals.push(...day(n, { kcal: 2400, protein: 160, salt: 11 }));
    const a = nutritionAnalytics(signals, { windowDays: 14, now: NOW, bodyMassKg: 85 });
    expect(kinds(a)).toContain("salt-high");
  });

  it("reports a missed fibre floor", () => {
    const signals: Signal[] = [];
    for (let n = 9; n >= 0; n--) signals.push(...day(n, { kcal: 2400, protein: 160, fiber: 8 }));
    const a = nutritionAnalytics(signals, { windowDays: 14, now: NOW, bodyMassKg: 85 });
    expect(kinds(a)).toContain("fiber-short");
  });

  it("names a direction on a long enough window", () => {
    const signals: Signal[] = [];
    for (let n = 19; n >= 0; n--) signals.push(...day(n, { kcal: 2400, protein: 100 + (19 - n) * 5 }));
    const a = nutritionAnalytics(signals, { windowDays: 30, now: NOW, bodyMassKg: 85 });
    expect(kinds(a)).toContain("trend-up");
  });

  it("never names a direction on a 7-day window", () => {
    const signals: Signal[] = [];
    for (let n = 6; n >= 0; n--) signals.push(...day(n, { kcal: 2400, protein: 100 + (6 - n) * 20 }));
    const a = nutritionAnalytics(signals, { windowDays: 7, now: NOW, bodyMassKg: 85 });
    expect(kinds(a)).not.toContain("trend-up");
  });

  it("ranks the most important finding first", () => {
    const signals: Signal[] = [];
    const sessions: LoggedSession[] = [];
    for (let n = 5; n >= 0; n--) {
      const trained = n % 2 === 0;
      signals.push(...day(n, { kcal: 1200, protein: trained ? 190 : 110 }));
      if (trained) sessions.push(session(n));
    }
    const a = nutritionAnalytics(signals, { windowDays: 7, now: NOW, sessions, bodyMassKg: 85 });
    // The rest-day gap outranks the calorie deficit, which outranks the rest.
    expect(a.insights[0]!.kind).toBe("protein-rest-gap");
    expect(a.insights.map((i) => i.weight)).toEqual([...a.insights.map((i) => i.weight)].sort((x, y) => y - x));
  });
});

describe("window independence", () => {
  it("keeps the yardstick free of today's training bump", () => {
    const signals: Signal[] = [];
    for (let n = 6; n >= 0; n--) signals.push(...day(n, { kcal: 2400, protein: 160 }));
    const withSessions = nutritionAnalytics(signals, { windowDays: 7, now: NOW, sessions: [session(0)], bodyMassKg: 85 });
    const without = nutritionAnalytics(signals, { windowDays: 7, now: NOW, bodyMassKg: 85 });
    // A session today must not move the average's target — that would make the
    // window's comparison lean on one day.
    expect(withSessions.targets.kcal).toBe(without.targets.kcal);
  });

  it("handles a completely empty stream without throwing", () => {
    const a = nutritionAnalytics([], { windowDays: 90, now: NOW });
    expect(a.loggedDays).toBe(0);
    expect(a.days).toHaveLength(90);
    expect(a.insights).toHaveLength(1);
    expect(a.insights[0]!.kind).toBe("logging-sparse");
    expect(MIN_DAYS_FOR_INSIGHT).toBeGreaterThan(0);
  });
});
